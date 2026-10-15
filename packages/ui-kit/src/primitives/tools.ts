import { iso, type P } from '../iso'
import { color } from '../tokens'
import { n } from '../svg'
import { isoBlock } from './block'
import { unit01 } from './dial'

const ink = () => `stroke="${color('ink')}" stroke-width="1" stroke-linejoin="round"`

/**
 * The MCP instrument module at centre `c`, scaled by `s`: a 24 by 16 box with its
 * top right corner chamfered, a round knob with a pointer, two short plug pins
 * below, and one accent dot (the module is live while it is drawn).
 */
export const moduleAt = (c: P, s = 1): string => {
  const p = (x: number, y: number) => `${n(c.x + x * s)},${n(c.y + y * s)}`
  const box = [p(-12, -8), p(8, -8), p(12, -4), p(12, 8), p(-12, 8)].join(' ')
  const k = { x: c.x - 4 * s, y: c.y }
  const r = 4.6 * s
  return `<g class="sk-module">`
    + `<path d="M${p(-7, 8)}V${n(c.y + 11 * s)}M${p(7, 8)}V${n(c.y + 11 * s)}" fill="none" ${ink()}/>`
    + `<polygon points="${box}" fill="${color('card')}" ${ink()}/>`
    + `<circle cx="${n(k.x)}" cy="${n(k.y)}" r="${n(r)}" fill="${color('card')}" ${ink()}/>`
    + `<line x1="${n(k.x)}" y1="${n(k.y)}" x2="${n(k.x + r * 0.7)}" y2="${n(k.y - r * 0.7)}" ${ink()} stroke-linecap="round"/>`
    + `<line x1="${n(c.x + 3 * s)}" y1="${n(c.y + 3 * s)}" x2="${n(c.x + 9 * s)}" y2="${n(c.y + 3 * s)}" stroke="${color('ink2')}" stroke-width=".8"/>`
    + `<circle cx="${n(c.x + 6 * s)}" cy="${n(c.y - 3 * s)}" r="${n(1.6 * s)}" fill="${color('accent')}"/>`
    + `</g>`
}

/** The MCP instrument module, centred on `at`. */
export const instrumentModule = (at: P): string => moduleAt(at, 1)

/** A reading glass centred on its lens: card-tinted glass, an ink rim and a handle down and right. */
export const magnifier = (at: P): string => {
  const R = 9
  return `<g class="sk-magnifier" transform="translate(${n(at.x)} ${n(at.y)})">`
    + `<g transform="rotate(45)"><rect x="${R + 1}" y="-2.2" width="15" height="4.4" rx="1.6" fill="${color('card')}" ${ink()}/>`
    + `<line x1="${R + 4}" y1="-2.2" x2="${R + 4}" y2="2.2" ${ink()}/></g>`
    + `<circle r="${R}" fill="${color('card')}" fill-opacity=".55" stroke="${color('ink')}" stroke-width="1.4"/>`
    + `<path d="M-5.6,-1.6 A6,6 0 0 1 -1.6,-5.6" fill="none" stroke="${color('ink2')}" stroke-width=".8" stroke-linecap="round"/>`
    + `</g>`
}

/**
 * An install: a service-toned package on a pallet, in iso world units with `at` as the
 * world origin (the pallet's back corner), like isoBlock. The caller moves `at` to make
 * it descend. `progress` slits the tape along the top in accent, from front to back.
 */
export const packageBlock = (at: P, progress: number): string => {
  const p = unit01(progress)
  let out = ''
  for (const y of [0, 13.5, 27]) out += isoBlock(at, { x: 0, y, z: 0, w: 30, d: 3, h: 3 }, 'data')
  out += isoBlock(at, { x: 0, y: 0, z: 3, w: 30, d: 30, h: 2 }, 'data')
  out += isoBlock(at, { x: 3, y: 3, z: 5, w: 24, d: 24, h: 18 }, 'service')
  const z = 23, a = iso(3, 15, z, at), b = iso(27, 15, z, at)
  out += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${color('ink')}" stroke-width="2.6" stroke-opacity=".18"/>`
  if (p > 0) {
    const e = iso(27 - 24 * p, 15, z, at)
    out += `<line x1="${n(b.x)}" y1="${n(b.y)}" x2="${n(e.x)}" y2="${n(e.y)}" stroke="${color('accent')}" stroke-width="1.2" stroke-dasharray="2 2"/>`
  }
  return `<g class="sk-package">${out}</g>`
}
