import type { P } from '../iso'
import { color, FONTS } from '../tokens'
import { label, n } from '../svg'

const mono = (x: number, y: number, size: number, weight: number, fill: string, text: string) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${FONTS.mono}" font-size="${size}" font-weight="${weight}" `
  + `letter-spacing="1.2" fill="${fill}">${text}</text>`

/** A dot at `from`, a dashed leader to `to`, and a two-line mono label beside `to`. */
export const callout = (from: P, to: P, text: string, sub?: string): string => {
  const ink = color('ink')
  let out = `<line x1="${n(from.x)}" y1="${n(from.y)}" x2="${n(to.x)}" y2="${n(to.y)}" stroke="${ink}" `
    + `stroke-width=".8" stroke-dasharray="2 2"/>`
    + `<circle cx="${n(from.x)}" cy="${n(from.y)}" r="1.8" fill="${ink}"/>`
    + mono(to.x + 3, to.y + 3, 7.5, 700, ink, label(text))
  if (sub) out += mono(to.x + 3, to.y + 12, 6.5, 400, color('ink2'), label(sub))
  return `<g class="sk-callout">${out}</g>`
}
