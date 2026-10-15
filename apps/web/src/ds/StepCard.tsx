import type { StepStatus } from '@sidecar/shared'
import { pad3 } from './util'

const MARK: Record<StepStatus, { glyph: string; say: string }> = {
  running: { glyph: '●', say: 'running' },
  ok: { glyph: '■', say: 'done' },
  failed: { glyph: '✕', say: 'failed' },
  interrupted: { glyph: '⏸', say: 'interrupted' },
}

/** One step as an index card with a numbered trapezoid tab. */
export function StepCard({ num, title, caption, status, selected, onSelect }: {
  num: number
  title: string
  caption?: string
  status: StepStatus
  selected: boolean
  onSelect: () => void
}) {
  const mark = MARK[status]
  return (
    <button
      type="button"
      className="ds-step"
      data-status={status}
      data-selected={selected || undefined}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="ds-cardtab ds-step__tab" data-ink={status === 'running' || selected || undefined}>
        <span><span className="ds-sr">Step </span>{pad3(num)}</span>
      </span>
      <span className="ds-step__card">
        <span className="ds-step__head">
          <span className="ds-step__title">{title}</span>
          <span className="ds-step__mark" aria-hidden>{mark.glyph}</span>
          <span className="ds-sr">, {mark.say}</span>
        </span>
        {caption ? <span className="ds-step__caption">{caption}</span> : null}
      </span>
    </button>
  )
}
