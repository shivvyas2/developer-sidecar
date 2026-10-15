import type { P } from '../iso'
import { color } from '../tokens'
import { esc, n } from '../svg'
import { mono } from './text'

/** Mono 7px with 1.2 letter-spacing is roughly 5.4 units a character. */
const CHAR = 5.4

/**
 * The bottom status strip: an ink rule from `at` across `w`, the step line in mono, and a
 * right-aligned ink block reading LIVE or REPLAY in paper. The text is cut to the room
 * left of the block (it is a sentence, so it is not held to the 18 character label limit).
 */
export const statusStrip = (at: P, w: number, s: { text: string; live: boolean }): string => {
  const ink = color('ink')
  const tag = s.live ? 'LIVE' : 'REPLAY'
  const bw = Math.max(46, tag.length * 6 + 12)
  const room = Math.max(1, Math.floor((w - bw - 12) / CHAR))
  const t = s.text.trim()
  const text = esc(t.length > room ? `${t.slice(0, room - 1)}…` : t)
  return `<g class="sk-status-strip sk-status-strip--${s.live ? 'live' : 'replay'}">`
    + `<line x1="${n(at.x)}" y1="${n(at.y)}" x2="${n(at.x + w)}" y2="${n(at.y)}" stroke="${ink}" stroke-width=".8"/>`
    + mono(at.x, at.y + 13, 7, ink, text, { weight: 600, spacing: 1.2 })
    + `<rect x="${n(at.x + w - bw)}" y="${n(at.y + 4)}" width="${n(bw)}" height="12" fill="${ink}"/>`
    + mono(at.x + w - bw / 2 + 0.8, at.y + 13, 7, color('paper'), tag, { weight: 700, anchor: 'middle', spacing: 1.6 })
    + `</g>`
}
