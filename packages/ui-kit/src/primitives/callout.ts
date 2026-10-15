import type { P } from '../iso'
import { color, FONTS } from '../tokens'
import { label, n } from '../svg'

const mono = (x: number, y: number, size: number, weight: number, fill: string, text: string, end: boolean) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${FONTS.mono}" font-size="${size}" font-weight="${weight}" `
  + `letter-spacing="1.2"${end ? ' text-anchor="end"' : ''} fill="${fill}">${text}</text>`

/**
 * A dot at `from`, a dashed leader to `to`, and a two-line mono label beside `to`:
 * to its right by default, or ending at it (`align: 'end'`) for a label left of its leader.
 */
export const callout = (from: P, to: P, text: string, sub?: string, opts: { align?: 'start' | 'end' } = {}): string => {
  const ink = color('ink')
  const end = opts.align === 'end'
  const x = end ? to.x - 3 : to.x + 3
  let out = `<line x1="${n(from.x)}" y1="${n(from.y)}" x2="${n(to.x)}" y2="${n(to.y)}" stroke="${ink}" `
    + `stroke-width=".8" stroke-dasharray="2 2"/>`
    + `<circle cx="${n(from.x)}" cy="${n(from.y)}" r="1.8" fill="${ink}"/>`
    + mono(x, to.y + 3, 7.5, 700, ink, label(text), end)
  if (sub) out += mono(x, to.y + 12, 6.5, 400, color('ink2'), label(sub), end)
  return `<g class="sk-callout">${out}</g>`
}
