import type { ReactNode } from 'react'

/** A drawer of step cards: a scrolling stack above the drawer front and its label. */
export function StepDrawer({ children, count, label = 'Steps' }: { children: ReactNode; count: number; label?: string }) {
  return (
    <section className="ds-drawer" aria-label={label}>
      <div className="ds-drawer__scroll" tabIndex={0}>{children}</div>
      <DrawerFront>{count} {count === 1 ? 'STEP' : 'STEPS'}</DrawerFront>
    </section>
  )
}

/** The trapezoid drawer front with its yellow label pill. */
export function DrawerFront({ children }: { children: ReactNode }) {
  return (
    <div className="ds-front">
      <span className="ds-label">{children}</span>
    </div>
  )
}
