import type { P } from '../iso'
import { color } from '../tokens'
import { label, n } from '../svg'
import { mono } from './text'

/** A stamped tab for saves (SAVED 042): ink outline, mono bold text, rotated -6 degrees about `at`. */
export const stamp = (at: P, text: string): string => {
  const t = label(text)
  const chars = t.replace(/&[a-z#0-9]+;/g, '_').length
  const w = chars * 6 + 18, h = 16, ink = color('ink')
  const shape = `M0,${h}L4,0H${n(w - 4)}L${n(w)},${h}Z`
  return `<g class="sk-stamp" transform="translate(${n(at.x)} ${n(at.y)}) rotate(-6)">`
    + `<path d="${shape}" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>`
    + `<path d="M5,${h - 2.5}H${n(w - 5)}" fill="none" stroke="${ink}" stroke-width=".6"/>`
    + mono(w / 2, 10.5, 8, ink, t, { weight: 700, anchor: 'middle', spacing: 1 })
    + `</g>`
}
