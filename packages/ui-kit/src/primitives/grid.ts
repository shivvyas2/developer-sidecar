import { VIEW } from '../layout'
import { color } from '../tokens'
import { n } from '../svg'

/** A size on the canvas: non-finite reads as the whole canvas, the rest is clamped to it. */
const span = (v: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : max)

/** The sheet background: thin grid lines every `step` units, as one path, never past the canvas. */
export const gridPaper = (w: number, h: number, step = 16): string => {
  const s = Number.isFinite(step) ? Math.max(2, step) : 16
  const gw = span(w, VIEW.w), gh = span(h, VIEW.h)
  let d = ''
  for (let x = 0; x <= gw; x += s) d += `M${n(x)},0V${n(gh)}`
  for (let y = 0; y <= gh; y += s) d += `M0,${n(y)}H${n(gw)}`
  return `<path class="sk-grid" d="${d}" fill="none" stroke="${color('grid')}" stroke-width=".5"/>`
}
