import type { P } from '../iso'
import { color, FONTS } from '../tokens'
import { label, MAX_LABEL, n } from '../svg'
import { fit, mono } from './text'

export interface ReadoutField { k: string; v: string; big?: boolean }
export interface ReadoutNote { k: string; v: string }

const CHAMFER = 16, PAD = 12, GAP = 8
/** Approximate advance per character: DotGothic16 digits run about half an em; mono keys 6px + 1.2 spacing. */
const DOT = 0.52, KEY = 5.4
const chars = (s: string) => Math.min(MAX_LABEL, s.trim().length)

/**
 * The chamfered readout panel: card fill, ink edge, the top-right corner cut at 16 and
 * an 8x6 accent tick on the top edge. Fields sit in content-sized columns (mono key, dot-matrix
 * value, 30 when big else 20). Optional note rows (one, or a list) follow a dotted rule, 14 apart.
 * `at` is top-left.
 */
export const readout = (at: P, w: number, fields: ReadoutField[], note?: ReadoutNote | ReadoutNote[]): string => {
  const W = Math.max(60, w)
  const notes = note === undefined ? [] : Array.isArray(note) ? note : [note]
  const H = notes.length ? 82 + (notes.length - 1) * 14 : 60
  const { x, y } = at
  const ink = color('ink')
  let out = `<path d="M${n(x)},${n(y)}h${n(W - CHAMFER)}l${CHAMFER},${CHAMFER}v${H - CHAMFER}h${n(-W)}Z" `
    + `fill="${color('card')}" stroke="${ink}" stroke-width="1.1" stroke-linejoin="round"/>`
    + `<rect x="${n(x + W / 2 - 4)}" y="${n(y - 3)}" width="8" height="6" fill="${color('accent')}"/>`
  // Columns are as wide as their content; spare room spreads into the gaps, a shortfall
  // shrinks every column in proportion and the values are cut to fit.
  const avail = W - 2 * PAD
  const size = fields.map((f) => (f.big ? 30 : 20))
  const need = fields.map((f, i) => Math.max(chars(f.k) * KEY, chars(f.v) * size[i]! * DOT))
  const gaps = Math.max(0, fields.length - 1)
  const total = need.reduce((a, b) => a + b, 0)
  const tight = total + gaps * GAP > avail
  const width = tight ? need.map((v) => ((avail - gaps * GAP) * v) / (total || 1)) : need
  const gap = tight || !gaps ? GAP : (avail - total) / gaps
  let fx = x + PAD
  fields.forEach((f, i) => {
    const cw = width[i]!
    out += mono(fx, y + 16, 6, ink, fit(f.k, cw / KEY), { weight: 700, spacing: 1.2 })
      + `<text x="${n(fx)}" y="${n(y + 48)}" font-family="${FONTS.dot}" font-size="${size[i]}" fill="${ink}">${fit(f.v, cw / (size[i]! * DOT))}</text>`
    fx += cw + gap
  })
  if (notes.length) {
    out += `<line x1="${n(x + PAD)}" y1="${n(y + 60)}" x2="${n(x + W - PAD)}" y2="${n(y + 60)}" stroke="${ink}" stroke-width=".6" stroke-dasharray="1 2"/>`
    const keys = notes.map((m) => label(m.k))
    const kw = Math.max(28, ...keys.map((k) => k.replace(/&[a-z#0-9]+;/g, '_').length * 4.8 + 10))
    notes.forEach((m, i) => {
      const ny = y + 73 + i * 14
      out += mono(x + PAD, ny, 6, ink, keys[i]!, { weight: 700, spacing: 1.2 })
        + mono(x + PAD + kw, ny, 6.5, ink, label(m.v), { spacing: 1 })
    })
  }
  return `<g class="sk-readout">${out}</g>`
}
