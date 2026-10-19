import { useEffect, useMemo, useState } from 'react'
import type { Chapter, FeedStep, StoryBeat } from '@sidecar/shared'
import { StepCard, StepDrawer } from './ds'
import { stepKind } from './format'
import { beatTitle, chapterLine, drawerRows, foldedBeatOf } from './storyView'

/**
 * The step drawer as a story, newest first: a header per thing you asked, a phase title above each
 * run of beats, and folded beats (a run of reading, repeat changes to one file) that open on a tap.
 */
export function StoryDrawer({ steps, chapters, selectedId, following, onPick }: {
  steps: FeedStep[]
  chapters: Chapter[]
  selectedId: string | null
  /** Following the newest step live: folded beats stay folded as steps arrive. */
  following: boolean
  onPick: (id: string) => void
}) {
  const byId = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps])
  const index = useMemo(() => new Map(steps.map((s, i) => [s.id, i])), [steps])
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  // A step picked elsewhere (the ruler, a decision, the Whiteboard) opens the folded beat that holds it.
  // While following live the newest step is the selected one, and opening its beat would undo the folding.
  const holder = following ? null : foldedBeatOf(chapters, selectedId)
  useEffect(() => { if (holder) setOpen((o) => (o.has(holder) ? o : new Set([...o, holder]))) }, [holder])
  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const card = (id: string, badge?: string) => {
    const s = byId.get(id)
    if (!s) return null
    return (
      <StepCard key={id} num={index.get(id)! + 1} title={stepKind(s)} caption={s.caption} status={s.status}
        selected={id === selectedId} onSelect={() => onPick(id)} {...(badge ? { badge } : {})} />
    )
  }
  const beat = (b: StoryBeat, key: string) => {
    if (b.type === 'step') return card(b.id, b.fixes ? 'FIXED' : b.fixedBy ? 'PROBLEM' : undefined)
    const isOpen = open.has(key)
    return (
      <div key={key} className="story__group" data-open={isOpen || undefined}>
        <button type="button" className="story__fold" aria-expanded={isOpen} onClick={() => toggle(key)}>
          <span className="story__fold-title">{beatTitle(b, byId)}</span>
          <span className="story__fold-count">{isOpen ? 'HIDE' : `${b.ids.length} STEPS`}</span>
        </button>
        {isOpen ? <div className="story__inner">{[...b.ids].reverse().map((id) => card(id))}</div> : null}
      </div>
    )
  }

  return (
    <StepDrawer count={steps.length}>
      {[...chapters].reverse().map((c) => (
        <section key={c.id} className="story__chapter" data-outcome={c.outcome} aria-label={c.asked ? `You asked: ${c.asked}` : 'Earlier steps'}>
          <button type="button" className="story__head" disabled={!c.promptId} aria-pressed={c.promptId === selectedId}
            onClick={() => c.promptId && onPick(c.promptId)}>
            <span className="ds-kicker">{c.promptId ? 'YOU ASKED' : 'EARLIER'}</span>
            {c.asked ? <span className="story__asked">{c.asked}</span> : null}
            <span className="story__line">{chapterLine(c)}</span>
          </button>
          {drawerRows(c).map((r) => (r.type === 'phase'
            ? <p key={r.key} className="story__phase">{r.title}</p>
            : beat(r.beat, r.key)))}
        </section>
      ))}
    </StepDrawer>
  )
}
