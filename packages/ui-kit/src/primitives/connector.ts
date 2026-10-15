import type { P } from '../iso'
import { color } from '../tokens'
import { n } from '../svg'

const ARC = 30
const SAMPLES = 32

const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const quad = (a: P, c: P, b: P, t: number): P => lerp(lerp(a, c, t), lerp(c, b, t), t)

/** Curve parameter at a fraction of the arc length, so progress draws at an even pace. */
const tAt = (a: P, c: P, b: P, frac: number): number => {
  const lens = [0]
  let prev = a
  for (let i = 1; i <= SAMPLES; i++) {
    const p = quad(a, c, b, i / SAMPLES)
    lens.push(lens[i - 1]! + Math.hypot(p.x - prev.x, p.y - prev.y))
    prev = p
  }
  const total = lens[SAMPLES]!
  if (total === 0) return frac
  const want = frac * total
  for (let i = 1; i <= SAMPLES; i++) {
    if (lens[i]! >= want) {
      const span = lens[i]! - lens[i - 1]!
      return (i - 1 + (span ? (want - lens[i - 1]!) / span : 0)) / SAMPLES
    }
  }
  return 1
}

/**
 * The orange dashed path from `from` to `to`, arcing 30 above the higher end,
 * drawn up to `progress`. The curve itself is truncated (de Casteljau split),
 * so the dashes stay dashes. A head dot shows while it is still drawing.
 */
export const connector = (from: P, to: P, progress: number): string => {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  const c = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - ARC }
  const t = p >= 1 ? 1 : tAt(from, c, to, p)
  const c1 = lerp(from, c, t)
  const end = quad(from, c, to, t)
  const accent = color('accent')
  let out = ''
  if (p > 0) {
    out += `<path d="M${n(from.x)},${n(from.y)} Q${n(c1.x)},${n(c1.y)} ${n(end.x)},${n(end.y)}" fill="none" `
      + `stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>`
  }
  if (p < 1) out += `<circle cx="${n(end.x)}" cy="${n(end.y)}" r="3" fill="${accent}"/>`
  return `<g class="sk-connector">${out}</g>`
}
