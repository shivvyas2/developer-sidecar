import { useEffect, useMemo, useRef } from 'react'
import type { Chapter, FeedStep } from '@sidecar/shared'
import { timelineOf } from './timelineView'

export interface TimelineProps {
  steps: FeedStep[]
  chapters: Chapter[]
  /** The step the town shows. */
  at: number
  live: boolean
  onSeek(index: number): void
  onLive(): void
}

const TONE_TEXT = { ok: 'done', failed: 'failed', fixed: 'fixed it', stopped: 'stopped', running: 'working' } as const

/** Each thing you asked as a band, each step a mark you can tap; the arrow keys step through, Home and End jump. */
export function Timeline({ steps, chapters, at, live, onSeek, onLive }: TimelineProps) {
  const t = useMemo(() => timelineOf(steps, chapters), [steps, chapters])
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => { strip.current?.querySelector('[data-at="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [at])
  const key = (e: React.KeyboardEvent) => {
    const last = steps.length - 1
    const to = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (to === null) return
    e.preventDefault()
    if (to >= last) onLive(); else onSeek(Math.max(0, to))
  }
  return (
    <div className="timeline" aria-label="The steps, as a timeline">
      <div className="timeline__state">
        {live ? <span className="timeline__live">LIVE</span> : <><span className="timeline__replay">REPLAY</span><button type="button" onClick={onLive}>Back to live</button></>}
        <span className="timeline__count">step {Math.max(0, at) + 1} of {steps.length}</span>
      </div>
      <div className="timeline__strip" ref={strip} tabIndex={0} onKeyDown={key} role="group" aria-label="Steps; use the arrow keys to move">
        {t.chapters.map((c) => (
          <div key={c.id} className="timeline__chapter" data-outcome={c.outcome}>
            <div className="timeline__asked" title={c.asked}>{c.asked ? `You asked: ${c.asked}` : 'Before your first request'}</div>
            <div className="timeline__marks">
              {t.marks.slice(c.from, c.to + 1).map((m) => (
                <button key={m.id} type="button" className="timeline__mark" data-tone={m.tone} data-at={m.index === at}
                  aria-label={`Step ${m.index + 1}: ${steps[m.index]!.caption} (${TONE_TEXT[m.tone]})`} title={steps[m.index]!.caption}
                  onClick={() => (m.index === steps.length - 1 ? onLive() : onSeek(m.index))} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
