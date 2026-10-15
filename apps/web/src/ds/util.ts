import type { KeyboardEvent } from 'react'

/** Zero-pads a step or decision number to three digits: 7 -> "007". */
export const pad3 = (n: number): string => String(Math.max(0, Math.trunc(n))).padStart(3, '0')

/**
 * Roving focus for tablists and radiogroups: arrow keys, Home and End move to a
 * sibling item and return its index, or null when the key is not a navigation key.
 */
export function rovingIndex(e: KeyboardEvent, index: number, count: number): number | null {
  let next: number
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': next = (index + 1) % count; break
    case 'ArrowLeft': case 'ArrowUp': next = (index - 1 + count) % count; break
    case 'Home': next = 0; break
    case 'End': next = count - 1; break
    default: return null
  }
  e.preventDefault()
  return next
}

/** Focuses the nth item matching `selector` inside the event's current parent group. */
export function focusSibling(e: KeyboardEvent<HTMLElement>, selector: string, index: number): void {
  const group = e.currentTarget.closest('[data-ds-group]')
  group?.querySelectorAll<HTMLElement>(selector)[index]?.focus()
}
