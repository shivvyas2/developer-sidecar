import { n } from './svg'

export interface P { x: number; y: number }
export const ISO_C = Math.cos(Math.PI / 6), ISO_S = Math.sin(Math.PI / 6)
/** World (x right-down, y left-down, z up) to screen, around origin o, scale s. */
export const iso = (x: number, y: number, z: number, o: P, s = 1): P =>
  ({ x: o.x + (x - y) * ISO_C * s, y: o.y + (x + y) * ISO_S * s - z * s })
export const pts = (ps: P[]) => ps.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')
