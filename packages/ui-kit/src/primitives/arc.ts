import type { P } from '../iso'
import { color } from '../tokens'
import { n } from '../svg'
import { lit, polar, unit01 } from './dial'
import { mono } from './text'

const TICKS = 120, A0 = 196, SWEEP = 110

/** The full circle, or with a floor inside it the part above the floor as one arc path. */
const ring = (c: P, r: number, floor: number | undefined, ink: string): string => {
  const style = `fill="none" stroke="${ink}" stroke-width=".9"`
  const dy = floor === undefined || !Number.isFinite(floor) ? r : floor - c.y
  if (dy >= r) return `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r)}" ${style}/>`
  if (dy <= -r) return ''
  const half = Math.sqrt(r * r - dy * dy), y = c.y + dy
  return `<path class="sk-arc-ring" d="M${n(c.x - half)},${n(y)}A${n(r)} ${n(r)} 0 ${dy > 0 ? 1 : 0} 1 ${n(c.x + half)},${n(y)}" ${style}/>`
}

/**
 * The large session arc that frames the stage: a thin ink circle of radius `r` and
 * 121 ticks over 110 degrees from 196 (every 10th long), lit in accent up to
 * `progress`. A pointer rises from the progress tick to a knob showing the percent.
 * With a `floor` the ring is drawn only above that y, as one arc over the top, so it
 * never runs under whatever sits below (the status strip).
 */
export const sessionArc = (c: P, r: number, progress: number, o: { floor?: number } = {}): string => {
  const p = unit01(progress)
  const ink = color('ink'), accent = color('accent')
  let out = ring(c, r, o.floor, ink)
  for (let i = 0; i <= TICKS; i++) {
    const deg = A0 + (SWEEP * i) / TICKS
    const len = i % 10 === 0 ? 9 : 4
    const a = polar(c, r + 8, deg), b = polar(c, r + 8 + len, deg)
    const on = lit(i, TICKS, p)
    out += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${on ? accent : ink}" stroke-width="${on ? 1.3 : 0.7}"/>`
  }
  const deg = A0 + SWEEP * p
  const foot = polar(c, r + 17, deg), top = polar(c, r + 28, deg)
  out += `<line x1="${n(foot.x)}" y1="${n(foot.y)}" x2="${n(top.x)}" y2="${n(top.y - 14)}" stroke="${ink}" stroke-width=".8"/>`
    + `<circle class="sk-arc-knob" cx="${n(top.x)}" cy="${n(top.y - 22)}" r="9" fill="${color('paper')}" stroke="${ink}" stroke-width="1"/>`
    + mono(top.x, top.y - 19.5, 7, ink, String(Math.round(p * 100)).padStart(2, '0'), { weight: 700, anchor: 'middle' })
  return `<g class="sk-session-arc">${out}</g>`
}
