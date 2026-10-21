import { useState } from 'react'
import type { PlaceId } from '@sidecar/shared'
import { OTHERS, PLACES } from './legendText'

/**
 * "What am I looking at?": the stage's pictures in plain words. A tap on a place in the stage shows
 * that place's line here (announced to screen readers); the full list opens on request.
 */
export function Legend({ tapped, onClear }: { tapped: PlaceId | null; onClear: () => void }) {
  const [open, setOpen] = useState(false)
  const hit = tapped ? PLACES[tapped] : null
  return (
    <div className="legend">
      <div className="legend__bar">
        <p className="legend__hit" aria-live="polite">
          {hit ? <><strong>{hit.title}.</strong> {hit.text} <button type="button" className="ds-link" onClick={onClear}>OK</button></> : 'Tap anything on the stage to see what it is.'}
        </p>
        <button type="button" className="legend__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'HIDE THE KEY' : 'WHAT AM I LOOKING AT?'}
        </button>
      </div>
      {open ? (
        <dl className="legend__list">
          {[...Object.values(PLACES), ...OTHERS].map((e) => (
            <div key={e.id} className="legend__row" data-on={e.id === tapped || undefined}>
              <dt>{e.title}</dt>
              <dd>{e.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}
