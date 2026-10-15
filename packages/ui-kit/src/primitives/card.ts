import type { P } from '../iso'
import { color } from '../tokens'
import { n } from '../svg'
import { fit, mono } from './text'

export type CardState = 'rest' | 'lifted' | 'inserting' | 'editing'
export interface IndexCardSpec {
  num: string
  title: string
  lines?: number
  state?: CardState
  progress?: number
  width?: number
}

const H = 54, TAB_H = 9, SLANT = 5, MAX_LINES = 5

/**
 * One index card, `at` is its top-left corner. A trapezoid tab on the top-left holds
 * the number (ink-filled once the card is in play), a bold mono title and grey content
 * bars. Editing strikes bar 2 and draws the accent rewrite up to `progress`.
 * Lifted and inserting only change the tab; the caller places the card.
 */
export const indexCard = (at: P, c: IndexCardSpec): string => {
  const state = c.state ?? 'rest'
  const w = Math.max(60, c.width ?? 160)
  const ink = color('ink'), grey = color('ink2')
  const { x, y } = at
  const tabW = Math.min(56, w * 0.4), tabX = x + 10
  const active = state !== 'rest'
  const tabFill = active ? ink : color('card')
  const tabText = active ? color('paper') : ink
  let lines = Math.min(MAX_LINES, Math.max(0, Math.round(c.lines ?? 4) || 0))
  if (state === 'editing') lines = Math.max(2, lines)

  let out = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${H}" fill="${color('card')}" stroke="${ink}" stroke-width="1.1"/>`
    + `<path class="sk-card-tab" d="M${n(tabX)},${n(y)}l${SLANT},${-TAB_H}h${n(tabW - 2 * SLANT)}l${SLANT},${TAB_H}Z" `
    + `fill="${tabFill}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`
    + mono(tabX + tabW / 2, y - 2, 6.5, tabText, fit(c.num, (tabW - 12) / 4.2), { weight: 700, anchor: 'middle' })
    + mono(x + 8, y + 14, 8, ink, fit(c.title, (w - 16) / 4.9), { weight: 700 })

  const barMax = w - 16
  for (let k = 0; k < lines; k++) {
    const by = y + 22 + k * 7
    const len = barMax * (1 - k * 0.16)
    out += `<line x1="${n(x + 8)}" y1="${n(by)}" x2="${n(x + 8 + len)}" y2="${n(by)}" stroke="${grey}" stroke-width="1.6" `
      + `stroke-linecap="round"${k === lines - 1 && lines > 1 ? ' stroke-dasharray="1 2"' : ''}${state === 'editing' && k === 1 ? ' opacity=".5"' : ''}/>`
  }
  if (state === 'editing') {
    const by = y + 29, len = barMax * 0.84
    const p = Math.min(1, Math.max(0, Number.isFinite(c.progress) ? c.progress! : 0))
    const head = x + 8 + len * p
    out += `<line class="sk-card-strike" x1="${n(x + 6)}" y1="${n(by)}" x2="${n(x + 10 + len)}" y2="${n(by)}" stroke="${ink}" stroke-width=".9"/>`
      + `<line class="sk-card-rewrite" x1="${n(x + 8)}" y1="${n(by + 3.5)}" x2="${n(head)}" y2="${n(by + 3.5)}" `
      + `stroke="${color('accent')}" stroke-width="1.6" stroke-linecap="round"/>`
      + `<rect x="${n(head)}" y="${n(by + 1)}" width="1.4" height="5" fill="${color('accent')}"/>`
  }
  return `<g class="sk-card sk-card--${state}">${out}</g>`
}
