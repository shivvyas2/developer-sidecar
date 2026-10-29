import { ellipsis } from '@sidecar/shared'

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Round for stable, compact SVG output. Never prints "-0". */
export const n = (v: number, digits = 1): string => {
  const f = 10 ** digits
  const r = Math.round(v * f) / f
  return (Object.is(r, -0) ? 0 : r).toString()
}

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]!)

export const MAX_LABEL = 18
export const truncate = (s: string): string => {
  const t = s.trim()
  return ellipsis(t, MAX_LABEL)
}
/** Spec-supplied text, ready to drop into SVG. */
export const label = (s: string): string => esc(truncate(s))

export const g = (x: number, y: number, body: string): string =>
  `<g transform="translate(${n(x)} ${n(y)})">${body}</g>`
