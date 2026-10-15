import type { CSSProperties, KeyboardEvent } from 'react'
import { focusSibling, rovingIndex } from './util'

export interface RotaryOption<T extends string> { value: T; label: string }

const SWEEP = 110

/** A dial-styled radio group: options sit around a ticked dial and the knob points at the chosen one. */
export function RotarySelect<T extends string>({ value, options, onChange, label }: {
  value: T
  options: RotaryOption<T>[]
  onChange: (value: T) => void
  label: string
}) {
  const n = options.length
  const angle = (i: number) => (n > 1 ? -SWEEP / 2 + (SWEEP * i) / (n - 1) : 0)
  const sel = Math.max(0, options.findIndex((o) => o.value === value))
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = rovingIndex(e, i, n)
    const opt = next === null ? undefined : options[next]
    if (next === null || !opt) return
    onChange(opt.value)
    focusSibling(e, '[role="radio"]', next)
  }
  return (
    <div className="ds-rotary" role="radiogroup" aria-label={label} data-ds-group>
      <span className="ds-rotary__dial" aria-hidden>
        <span className="ds-rotary__knob" style={{ '--ds-a': `${angle(sel)}deg` } as CSSProperties} />
      </span>
      {options.map((o, i) => {
        const on = i === sel
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="ds-rotary__opt"
            style={{ '--ds-a': `${angle(i)}deg` } as CSSProperties}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
