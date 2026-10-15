import type { CSSProperties } from 'react'

/** A range input drawn as an instrument ruler: ticks, an accent progress line and a ringed knob. */
export function TickRuler({ value, max, onChange, label = 'Replay position', valueText }: {
  value: number
  max: number
  onChange: (value: number) => void
  label?: string
  valueText?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <input
      type="range"
      className="ds-ruler"
      min={0}
      max={Math.max(0, max)}
      step={1}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ '--ds-pct': `${pct}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    />
  )
}
