import type { P } from '../iso'
import { color } from '../tokens'
import { label, n } from '../svg'
import { mono } from './text'

const R = 8, PITCH = 20

/** Round LT / P / TC buttons, `at` is the first centre. The first `lit` are accent with paper text. */
export const indicatorRow = (at: P, keys: string[], lit: number): string => {
  const on = Math.max(0, Math.floor(Number.isFinite(lit) ? lit : 0))
  const ink = color('ink')
  const out = keys.map((k, i) => {
    const x = at.x + i * PITCH, hot = i < on
    return `<circle cx="${n(x)}" cy="${n(at.y)}" r="${R}" fill="${hot ? color('accent') : color('card')}" stroke="${ink}" stroke-width=".9"/>`
      + mono(x, at.y + 2.2, 6, hot ? color('paper') : ink, label(k), { weight: 700, anchor: 'middle' })
  }).join('')
  return `<g class="sk-indicators">${out}</g>`
}
