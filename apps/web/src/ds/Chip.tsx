import type { ReactNode } from 'react'

/** A small rounded outline label in mono. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="ds-chip">{children}</span>
}
