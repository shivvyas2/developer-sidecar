import type { P } from '../iso'
import { color, FONTS } from '../tokens'
import { label, n } from '../svg'
import { mono } from './text'

export type DialState = 'run' | 'ok' | 'fail'
export interface DialSpec { progress: number; value: string; title: string; unit?: string; state?: DialState }

const TICKS = 48, A0 = 135, A1 = 405
/** Below this radius there is no room inside: the inner ring goes and the labels sit under the dial. */
const SMALL = 30

/** Clamp to 0..1; anything not finite reads as 0. */
export const unit01 = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))

/** The point at `deg` degrees (SVG convention, clockwise from 3 o'clock) and radius `r` around `c`. */
export const polar = (c: P, r: number, deg: number): P => {
  const a = (deg * Math.PI) / 180
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }
}

/** A tick is lit when progress has reached it; nothing is lit at 0. */
export const lit = (i: number, count: number, p: number): boolean => p > 0 && i <= p * count + 1e-9

/**
 * A round instrument dial: ink rim, grey inner ring, a 270 degree ring of 49 ticks
 * (every 6th long) lit in accent up to `progress`, a marker knob at the progress angle,
 * and a dot-matrix value with a small-caps title above and the unit below.
 * Under r 30 the inner ring is dropped and the title and unit sit beneath the dial.
 * `ok` swaps the value for an ink check, `fail` for an accent cross.
 */
export const dial = (c: P, r: number, d: DialSpec): string => {
  const p = unit01(d.progress)
  const state = d.state ?? 'run'
  const ink = color('ink'), accent = color('accent')
  const small = r < SMALL
  let out = `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r)}" fill="none" stroke="${ink}" stroke-width="1"/>`
  if (!small) out += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r - 10)}" fill="none" stroke="${color('ink2')}" stroke-width=".8"/>`
  for (let i = 0; i <= TICKS; i++) {
    const deg = A0 + ((A1 - A0) * i) / TICKS
    const len = i % 6 === 0 ? 6 : 3
    const a = polar(c, r + 3, deg), b = polar(c, r + 3 + len, deg)
    const on = lit(i, TICKS, p)
    out += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${on ? accent : ink}" stroke-width="${on ? 1.4 : 0.8}"/>`
  }
  const k = polar(c, r + 12, A0 + (A1 - A0) * p)
  out += `<circle class="sk-dial-knob" cx="${n(k.x)}" cy="${n(k.y)}" r="3" fill="${color('paper')}" stroke="${ink}" stroke-width="1"/>`

  const size = r * 0.75
  const glyph = (fill: string, text: string, font: string) =>
    `<text class="sk-dial-value" x="${n(c.x)}" y="${n(c.y + size * 0.36)}" font-family="${font}" font-size="${n(size)}" `
    + `text-anchor="middle" fill="${fill}">${text}</text>`
  if (state === 'ok') out += glyph(ink, '✓', FONTS.mono)
  else if (state === 'fail') out += glyph(accent, '✕', FONTS.mono)
  else out += glyph(ink, label(d.value), FONTS.dot)

  const titleY = small ? c.y + r + 18 : c.y - r * 0.45
  const unitY = small ? titleY + 8 : c.y + r * 0.58
  out += mono(c.x, titleY, 6.5, ink, label(d.title.toUpperCase()), { weight: 700, anchor: 'middle', spacing: 1.4 })
  if (d.unit) out += mono(c.x, unitY, 6, color('ink2'), label(d.unit.toUpperCase()), { anchor: 'middle', spacing: 1.2 })
  return `<g class="sk-dial sk-dial--${state}">${out}</g>`
}
