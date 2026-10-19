import { useState } from 'react'
import type { ProjectMap } from '@sidecar/shared'
import { boardFrom, MAX_STEP_LINKS, type BoardItem } from './whiteboard'

const INTRO = 'What you’re building, from what Claude has looked at and changed. Tap a part to see its files and the steps that touched it.'
const EMPTY = 'Nothing on the map yet. As Claude looks at and changes your project, its parts show up here: pages, behind-the-scenes code, your data, outside services and more.'

/** "What you're building": the project map as cards, one section per kind of part. */
export function WhiteboardView({ map, stepIds, liveId, onPick }: {
  map: ProjectMap
  stepIds: string[]
  liveId: string | null
  onPick: (stepId: string) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const board = boardFrom(map, stepIds, liveId)
  if (board.length === 0) return <p className="empty">{EMPTY}</p>
  return (
    <div className="board">
      <p className="board__intro">{INTRO}</p>
      <div className="board__grid">
        {board.map((s) => (
          <section key={s.kind} className="board__section" aria-label={s.title}>
            <h2 className="ds-kicker board__title">{s.title} <span className="board__count">{s.items.length}</span></h2>
            <ul className="board__items">
              {s.items.map((i) => (
                <li key={i.id}>
                  <Part item={i} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} onPick={onPick} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function Part({ item, open, onToggle, onPick }: { item: BoardItem; open: boolean; onToggle: () => void; onPick: (id: string) => void }) {
  const shown = item.steps.slice(-MAX_STEP_LINKS)
  const more = item.steps.length - shown.length
  return (
    <div className="board__part" data-state={item.state} data-live={item.live || undefined}>
      <button type="button" className="board__name" aria-expanded={open} onClick={onToggle}>
        <span>{item.name}</span>
        <span className="board__state">{item.live ? 'working on it now' : item.stateText}</span>
      </button>
      {open ? (
        <div className="board__detail">
          {item.files.length ? <ul className="board__files">{item.files.map((f) => <li key={f}><code>{f}</code></li>)}</ul> : null}
          {shown.length ? (
            <p className="board__steps">
              Steps{more > 0 ? ` (latest ${shown.length} of ${item.steps.length})` : ''}:{' '}
              {shown.map((st) => (
                <button key={st.id} type="button" className="ds-link board__step" onClick={() => onPick(st.id)} title="Show this step on the Stage">{st.num}</button>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
