import type { P } from '../iso'
import { color } from '../tokens'
import { n } from '../svg'
import { fit, mono } from './text'

export interface DrawerCard { num: string; name: string; group?: boolean }
export interface CardDrawerSpec { cards: DrawerCard[]; lifted?: string; label: string; width?: number }

export const MAX_DRAWER_CARDS = 8
const COLS = 3, TAB = 0.3, PITCH = 0.3, MARGIN = 0.05
const GAP = 12, TAB_H = 9, SLANT = 5, FRONT_H = 40, CHAR = 4.2

/** Tab x offsets (from the drawer's left) and widths: 3 fixed columns, cycling, a column apart. */
export const tabSlots = (count: number, width: number): { x: number; w: number }[] =>
  Array.from({ length: Math.max(0, count) }, (_, i) => ({ x: width * (MARGIN + (i % COLS) * PITCH), w: width * TAB }))

/** Visible characters a tab name may use: floor((tabW-16)/4.2), less the number and a space. */
const nameBudget = (tabW: number, num: string) => Math.floor((tabW - 16) / CHAR) - (num.length + 1)

/**
 * A card-catalog drawer seen from above the front: up to 8 staggered card edges with
 * numbered trapezoid tabs in 3 columns (black tabs for groups), then the drawer front
 * with a yellow label pill (its text in onLabel, so it reads in both themes). `at` is the top-left of the back card's tab row.
 * The card whose num is `lifted` is skipped; the caller draws it with indexCard.
 */
export const cardDrawer = (at: P, d: CardDrawerSpec): string => {
  const w = Math.max(120, d.width ?? 360)
  const shown = d.cards.slice(0, MAX_DRAWER_CARDS)
  const slots = tabSlots(shown.length, w)
  const ink = color('ink'), card = color('card')
  const rows = Math.max(1, shown.length)
  // Back cards sit a little narrower; keep every inset (plus the 4 unit corner) inside the margin.
  const step = rows > 1 ? Math.max(0, Math.min(1.5, (w * MARGIN - 5) / (rows - 1))) : 0
  const frontY = at.y + TAB_H + rows * GAP + 4
  const stroke = `stroke="${ink}" stroke-width=".9" stroke-linejoin="round"`
  let out = ''

  shown.forEach((c, i) => {
    if (d.lifted !== undefined && c.num === d.lifted) return
    const inset = (rows - 1 - i) * step
    const l = at.x + inset, r = at.x + w - inset
    const y = at.y + TAB_H + i * GAP
    const s = slots[i]!, tx = at.x + s.x
    const top = `M${n(l)},${n(y + 4)}Q${n(l)},${n(y)} ${n(l + 4)},${n(y)}H${n(tx)}`
      + `L${n(tx + SLANT)},${n(y - TAB_H)}H${n(tx + s.w - SLANT)}L${n(tx + s.w)},${n(y)}`
      + `H${n(r - 4)}Q${n(r)},${n(y)} ${n(r)},${n(y + 4)}`
    out += `<path d="${top}V${n(frontY)}H${n(l)}Z" fill="${card}"/>`
      + `<path d="M${n(l)},${n(frontY)}V${n(y + 4)}Q${n(l)},${n(y)} ${n(l + 4)},${n(y)}H${n(tx)}" fill="none" ${stroke}/>`
      + `<path d="M${n(tx + s.w)},${n(y)}H${n(r - 4)}Q${n(r)},${n(y)} ${n(r)},${n(y + 4)}V${n(frontY)}" fill="none" ${stroke}/>`
    const fill = c.group ? ink : card, text = c.group ? color('paper') : ink
    out += `<path class="sk-drawer-tab${c.group ? ' sk-drawer-tab--group' : ''}" d="M${n(tx)},${n(y)}`
      + `L${n(tx + SLANT)},${n(y - TAB_H)}H${n(tx + s.w - SLANT)}L${n(tx + s.w)},${n(y)}" fill="${fill}" ${stroke}/>`
      + mono(tx + 8, y - 2.2, 6.5, text, fit(c.num, 6), { weight: c.group ? 700 : 400 })
      + mono(tx + s.w - 8, y - 2.2, 6.5, text, fit(c.name, nameBudget(s.w, c.num)), { anchor: 'end', weight: c.group ? 700 : 400 })
  })

  const fl = at.x - 8, fr = at.x + w + 8
  out += `<path class="sk-drawer-front" d="M${n(fl)},${n(frontY)}H${n(fr)}L${n(fr - 8)},${n(frontY + FRONT_H)}H${n(fl + 8)}Z" `
    + `fill="${color('paper')}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`
  const text = fit(d.label, 24)
  const chars = text.replace(/&[a-z#0-9]+;/g, '_').length
  const pw = Math.max(56, chars * 4.6 + 18), cx = at.x + w / 2, py = frontY + FRONT_H / 2 - 7
  out += `<rect x="${n(cx - pw / 2)}" y="${n(py)}" width="${n(pw)}" height="14" rx="3" fill="${color('label')}" ${stroke}/>`
    + mono(cx, py + 9.6, 7, color('onLabel'), text, { anchor: 'middle', weight: 600 })
  return `<g class="sk-drawer">${out}</g>`
}
