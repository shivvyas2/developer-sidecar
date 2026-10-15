import type { P } from '../iso'
import { isoBlock } from './block'

export const MAX_FLOORS = 5
const W = 60, D = 46, BASE = 26, FLOOR = 22

/** Your App: a beige base slab with 1..5 yellow floors. While building, the newest floor is dashed. */
export const isoStack = (o: P, floors: number, opts: { building?: boolean; scale?: number } = {}): string => {
  const count = Math.min(MAX_FLOORS, Math.max(1, Math.round(floors) || 1))
  const scale = opts.scale ?? 1
  let out = isoBlock(o, { x: 0, y: 0, z: 0, w: W, d: D, h: BASE }, 'data', { scale })
  for (let i = 0; i < count; i++) {
    const dashed = !!opts.building && i === count - 1
    out += isoBlock(o, { x: 0, y: 0, z: BASE + i * FLOOR, w: W, d: D, h: FLOOR }, 'app', { scale, dashed })
  }
  return `<g class="sk-stack">${out}</g>`
}
