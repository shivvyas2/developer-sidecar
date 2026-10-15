import { iso, pts, type P } from '../iso'
import { color, type ColorToken } from '../tokens'

export type BlockTone = 'app' | 'service' | 'data' | 'auth' | 'ok' | 'paper'
export interface Box { x: number; y: number; z: number; w: number; d: number; h: number }

const TONE: Record<BlockTone, ColorToken> = {
  app: 'blockApp', service: 'blockService', data: 'blockData', auth: 'blockAuth', ok: 'blockOk', paper: 'card',
}

/**
 * One isometric volume: left and right sides, then the top. Solid sides carry
 * sk-face-l / sk-face-r so themeCss can deepen the shading in dark mode. Edges are
 * stroked in one unfiltered path so the shading never dims the ink.
 * Dashed draws an unfilled outline (a floor under construction).
 */
export const isoBlock = (o: P, b: Box, tone: BlockTone, opts: { dashed?: boolean; scale?: number } = {}): string => {
  const s = opts.scale ?? 1
  const at = (x: number, y: number, z: number) => iso(x, y, z, o, s)
  const { x, y, z, w, d, h } = b
  const top = [at(x, y, z + h), at(x + w, y, z + h), at(x + w, y + d, z + h), at(x, y + d, z + h)]
  const left = [at(x, y + d, z), at(x + w, y + d, z), at(x + w, y + d, z + h), at(x, y + d, z + h)]
  const right = [at(x + w, y, z), at(x + w, y + d, z), at(x + w, y + d, z + h), at(x + w, y, z + h)]
  const ink = `stroke="${color('ink')}" stroke-width="1" stroke-linejoin="round"`
  if (opts.dashed) {
    const a = `fill="none" ${ink} stroke-dasharray="3 3"`
    return `<g class="sk-block sk-block--dashed"><polygon points="${pts(left)}" ${a}/>`
      + `<polygon points="${pts(right)}" ${a}/><polygon points="${pts(top)}" ${a}/></g>`
  }
  const f = `fill="${color(TONE[tone])}"`
  const edges = [left, right, top].map((q) => `M${pts(q).replace(/ /g, 'L')}Z`).join('')
  return `<g class="sk-block sk-block--${tone}">`
    + `<polygon class="sk-face-l" points="${pts(left)}" ${f} filter="brightness(.88)"/>`
    + `<polygon class="sk-face-r" points="${pts(right)}" ${f} filter="brightness(.95)"/>`
    + `<polygon class="sk-face-t" points="${pts(top)}" ${f}/>`
    + `<path d="${edges}" fill="none" ${ink}/></g>`
}
