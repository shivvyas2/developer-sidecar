import { useId, type ReactNode } from 'react'
import { pad3 } from './util'

/** The selected step pulled out of the drawer at full size. */
export function PulledCard({ num, title, children }: { num: number; title: string; children?: ReactNode }) {
  const id = useId()
  return (
    <article className="ds-pulled" aria-labelledby={id}>
      <span className="ds-cardtab ds-pulled__tab" data-ink>
        <span><span className="ds-sr">Step </span>{pad3(num)}</span>
      </span>
      <div className="ds-pulled__card">
        <h2 className="ds-pulled__title" id={id}>{title}</h2>
        {children}
      </div>
    </article>
  )
}
