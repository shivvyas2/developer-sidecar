import type { ReactNode } from 'react'
import { RoundButton } from './RoundButton'

export interface StripAction { label: string; title: string; onPress: () => void }

/** A banner: an ink tag block, the reason, and an optional round action. `alert` marks it in the accent colour. */
export function StatusStrip({ tag, children, action, tone }: {
  tag: string
  children: ReactNode
  action?: StripAction
  tone?: 'alert'
}) {
  return (
    <div className="ds-strip" role="status" data-tone={tone}>
      <span className="ds-strip__tag">{tag}</span>
      <span className="ds-strip__text">{children}</span>
      {action ? <RoundButton label={action.label} title={action.title} onPress={action.onPress} /> : null}
    </div>
  )
}
