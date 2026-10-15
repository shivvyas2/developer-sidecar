import type { P } from '../iso'
import { color } from '../tokens'
import { esc, n } from '../svg'
import { mono } from './text'

/** The prompt is a sentence, so it gets more room than an 18 character label. */
const MAX = 34
/** Mono 7px is about 4.2 units a character. */
const CHAR = 4.2

/**
 * You: a 2px ink caret standing on `at`, and a speech box above and right of it
 * (card fill, ink rule, a tail down to the caret) holding the prompt in mono 7px,
 * escaped and cut to 34 characters.
 */
export const cursor = (at: P, text: string): string => {
  const t = text.trim()
  const cut = t.length > MAX ? `${t.slice(0, MAX - 1)}…` : t
  const ink = color('ink'), card = color('card')
  const w = 10 + cut.length * CHAR, h = 14
  const x = at.x + 6, y = at.y - 11 - 8 - h
  return `<g class="sk-cursor">`
    + `<rect x="${n(at.x)}" y="${n(at.y - 11)}" width="2" height="11" fill="${ink}"/>`
    + `<rect class="sk-speech" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${h}" fill="${card}" stroke="${ink}" stroke-width="1"/>`
    + `<path d="M${n(x + 4)},${n(y + h)} L${n(at.x + 1.5)},${n(at.y - 13.5)} L${n(x + 10)},${n(y + h)}" fill="${card}" stroke="${ink}" stroke-width="1" stroke-linejoin="round"/>`
    + `<line x1="${n(x + 4.6)}" y1="${n(y + h)}" x2="${n(x + 9.4)}" y2="${n(y + h)}" stroke="${card}" stroke-width="1.6"/>`
    + mono(x + 5, y + 9.6, 7, ink, esc(cut))
    + `</g>`
}
