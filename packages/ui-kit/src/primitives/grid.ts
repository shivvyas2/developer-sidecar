import { color } from '../tokens'
import { n } from '../svg'

/** The sheet background: thin grid lines every `step` units, as one path. */
export const gridPaper = (w: number, h: number, step = 16): string => {
  const s = Math.max(2, step)
  let d = ''
  for (let x = 0; x <= w; x += s) d += `M${n(x)},0V${n(h)}`
  for (let y = 0; y <= h; y += s) d += `M0,${n(y)}H${n(w)}`
  return `<path class="sk-grid" d="${d}" fill="none" stroke="${color('grid')}" stroke-width=".5"/>`
}
