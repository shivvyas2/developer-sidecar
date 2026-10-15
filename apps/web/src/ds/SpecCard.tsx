import { useId } from 'react'
import { pad3 } from './util'

/** A decision as a spec sheet: header band, CHOSE box, INSTEAD OF list, reason and a step link. */
export function SpecCard({ num, title, chose, alternatives, reason, step, onStep }: {
  num: number
  title: string
  chose: string
  alternatives: string[]
  reason: string
  step?: number
  onStep?: (step: number) => void
}) {
  const id = useId()
  return (
    <article className="ds-spec" aria-labelledby={id}>
      <h3 className="ds-spec__band" id={id}>DECISION {pad3(num)} · {title}</h3>
      <div className="ds-spec__body">
        <div className="ds-spec__row">
          <span className="ds-kicker">CHOSE</span>
          <span className="ds-spec__chose">{chose}</span>
        </div>
        {alternatives.length > 0 ? (
          <div className="ds-spec__row">
            <span className="ds-kicker">INSTEAD OF</span>
            <ul className="ds-spec__alts">
              {alternatives.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        ) : null}
        <p className="ds-spec__reason">{reason}</p>
        {step !== undefined && onStep ? (
          <button type="button" className="ds-link" onClick={() => onStep(step)}>step {pad3(step)}</button>
        ) : null}
      </div>
    </article>
  )
}
