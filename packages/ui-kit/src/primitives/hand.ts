import type { P } from '../iso'
import { color } from '../tokens'
import { n } from '../svg'
import { isoBlock } from './block'
import { dial } from './dial'
import { moduleAt } from './tools'

export type HandPose = 'point' | 'press' | 'hold'
export type Holding = 'card' | 'block' | 'module'
export interface HandSpec { pose: HandPose; holding?: Holding; scale?: number; facing?: 1 | -1 }

/*
 * The hand is drawn in its own frame: the touching point at 0,0, the wrist off to
 * the right (+x) and up as -y, seen from the thumb side like the reference poster.
 * Facing 1 reaches left; -1 mirrors it to reach right. Shapes are painted back to
 * front: sleeve, cuff, back of hand, pinky, ring, middle, index, thumb. Most are
 * open paths: the fill closes them under the next shape, the stroke stays open, so
 * one finger flows into the back of the hand without a seam.
 */

const SLEEVE = 'M108,-21 L91,-19.5 L91,10.5 L108,12'
const CUFF = 'M81,-18.5 L91,-19.5 L91,10.5 L81,9.5 Z'
const BACK = 'M40,-15.5 C48,-19.8 58,-20 67,-18 L82,-16 L82,8 L69,8 C63,9.5 59,14.5 56,21 L38,22'
const PINKY = 'M57,16 L36,17.8 C31,18.2 31,24 36,24 L56,22.8'
const RING = 'M54,9.6 L31.5,11.4 C26,11.8 26,19 31.5,19 L54,17.8'
const MIDDLE = 'M51,2.8 L27.5,4.2 C21.5,4.6 21,12.4 27,12.6 L51,11.6'
const THUMB = 'M63,-9.5 C53,-8 41,-5.6 31,-3.2 C26,-2 25.4,4 30,4.4 C39,4.6 51,2.8 61,1'
/** Thumbnail, a knuckle crease on the back and a wrinkle at the base of the thumb. */
const THUMB_LINES = 'M27.4,-1.4 C30,-1.2 31.2,1 30.6,3.6 M47,-0.6 C50,-1.8 53,-2 56,-1.6'

/** Index finger per pose; it starts on the back contour at 40,-15.5 (body frame). */
const INDEX_POINT = 'M40,-15.5 C36,-12.8 32,-9.8 27,-7.6 L5,-4.2 C2,-3.6 0,-2 0,0 C0,2 2,3.6 5,3.6 L30,3.2 L46,2.6'
const NAIL_POINT = 'M1.8,-2.6 C3.6,-1.2 6.8,-1.4 9,-3.8 M14.5,3.6 C15.4,2.4 16.8,2 18,2.2 M20.5,-6 C21.6,-4.8 21.6,-3.4 21,-2.2'
/** Press: the body sits 8 right and 20 up; the finger slopes down and the tip lands on 0,0. */
const PRESS_DX = 8, PRESS_DY = -20
const INDEX_PRESS = 'M48,-35.5 C44,-32.5 40,-29 35,-26.8 L15,-21.4 C12,-20.6 9.6,-19.2 8,-17.2 L-4.5,-6.8 '
  + 'C-5.6,-4.2 -3,0.2 0,0 C1.6,-0.1 2.6,-0.8 3.4,-2 L8,-8.4 C9.6,-11 11.4,-12.6 14,-13.5 L35,-17.2 L54,-17.4'
const NAIL_PRESS = 'M-3.4,-4 C-1.8,-4.8 0,-7.2 0.4,-9.6 M5.4,-6.2 C6.6,-6.4 7.6,-7.2 8,-8.4 M27.6,-24.6 C28.6,-23.4 28.6,-22 28,-20.8'
/** Hold: the index curls like the others, the thumb pinches what hangs below. */
const HOLD_DX = -16, HOLD_DY = -11
const INDEX_HOLD = 'M40,-15.5 C36,-12.8 32,-9.8 27,-7.6 L21,-6.6 C14.5,-5.6 14,3.6 20.5,3.8 L46,2.6'
const NAIL_HOLD = 'M19,-6.2 C16.8,-4 16.8,0 19,2.2'
/** In the grip the thumb reaches past the curled index to pinch the held thing. */
const THUMB_HOLD = 'M63,-9.5 C53,-8 38,-6.2 21,-3.8 C13.5,-2.6 12.6,4 17.6,4.4 C30,4.8 48,3 61,1'
const THUMB_HOLD_LINES = 'M14.6,-2.2 C17,-1.8 18.2,0.6 17.6,3.4 M47,-0.6 C50,-1.8 53,-2 56,-1.6'

const shape = (d: string, fill = true) =>
  `<path d="${d}"${fill ? '' : ' fill="none"'} vector-effect="non-scaling-stroke"/>`

const body = (dx: number, dy: number, index: string, lines: string, thumb = THUMB, thumbLines = THUMB_LINES) => {
  const parts = shape(SLEEVE) + shape(CUFF) + shape(BACK) + shape(PINKY) + shape(RING) + shape(MIDDLE)
  const shifted = dx || dy ? `<g transform="translate(${n(dx)} ${n(dy)})">${parts}</g>` : parts
  return { back: shifted + index + lines, front: `<g transform="translate(${n(dx)} ${n(dy)})">${shape(thumb)}${shape(thumbLines, false)}</g>` }
}

/** A small held index card: square corners and two ruled lines. */
const heldCard = (c: P, s: number) => {
  const w = 16 * s, h = 22 * s, x = c.x - w / 2, y = c.y - h
  const ink = color('ink'), ink2 = color('ink2')
  const rule = (yy: number) => `<line x1="${n(x + 3 * s)}" y1="${n(yy)}" x2="${n(x + w - 3 * s)}" y2="${n(yy)}" stroke="${ink2}" stroke-width=".8"/>`
  return `<g class="sk-held sk-held--card">`
    + `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${color('card')}" stroke="${ink}" stroke-width="1"/>`
    + rule(y + h - 9 * s) + rule(y + h - 5 * s) + `</g>`
}

const held = (what: Holding, c: P, s: number): string => {
  if (what === 'card') return heldCard(c, s)
  if (what === 'module') return moduleAt({ x: c.x, y: c.y - 11 * s }, s * 0.8)
  const w = 12, h = 10
  return `<g class="sk-held sk-held--block">${isoBlock({ x: c.x, y: c.y - w * s }, { x: 0, y: 0, z: 0, w, d: w, h }, 'service', { scale: s })}</g>`
}

/**
 * Claude: a line-art hand in card fill with a 1.1px ink stroke that keeps its weight at
 * any scale. `point` extends the index finger, `press` bends the fingertip down onto
 * what it touches, `hold` closes the fist and pinches a small card, block or module
 * between thumb and index so it stands out in front. The origin is the touching
 * point: the fingertip for point and press, and the bottom of the held thing (or
 * where it would be) for hold.
 */
export const hand = (at: P, h: HandSpec): string => {
  const s = h.scale ?? 1
  const f = h.facing ?? 1
  const frame = (body: string) => `<g transform="translate(${n(at.x)} ${n(at.y)}) scale(${n(s * f, 3)} ${n(s, 3)})" `
    + `fill="${color('card')}" stroke="${color('ink')}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">${body}</g>`
  let parts
  if (h.pose === 'point') parts = body(0, 0, shape(INDEX_POINT), shape(NAIL_POINT, false))
  else if (h.pose === 'press') parts = body(PRESS_DX, PRESS_DY, shape(INDEX_PRESS), shape(NAIL_PRESS, false))
  else parts = body(HOLD_DX, HOLD_DY, `<g transform="translate(${HOLD_DX} ${HOLD_DY})">${shape(INDEX_HOLD)}${shape(NAIL_HOLD, false)}</g>`, '', THUMB_HOLD, THUMB_HOLD_LINES)
  const item = h.pose === 'hold' && h.holding ? held(h.holding, at, s) : ''
  return `<g class="sk-hand sk-hand--${h.pose}">${frame(parts.back)}${item}${frame(parts.front)}</g>`
}

/** A subagent: the hand at 0.7 scale pointing, with a tiny r 9 dial over its back. */
export const helperHand = (at: P, progress: number): string =>
  `<g class="sk-helper-hand">${hand(at, { pose: 'point', scale: 0.7 })}`
  + `${dial({ x: at.x + 44, y: at.y - 34 }, 9, { progress, value: '', title: '' })}</g>`
