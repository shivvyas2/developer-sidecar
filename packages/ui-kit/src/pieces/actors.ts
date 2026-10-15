import { legacyColor } from '../tokens'
import { n } from '../svg'
import type { ActorFrame } from '../timeline'

const S = `stroke="${legacyColor('ink')}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`

function lift(a: ActorFrame, t: number): number {
  switch (a.pose) {
    case 'walk': return -Math.abs(Math.sin(t / 110)) * 4
    case 'celebrate': return -(Math.sin(a.p * Math.PI * 2) ** 2) * 26
    case 'idle': return Math.sin(t / 420) * 1.2
    default: return 0
  }
}

function legs(a: ActorFrame, t: number): string {
  const swing = a.pose === 'walk' ? Math.sin(t / 110) * 5 : 0
  return `<line x1="-7" y1="-16" x2="${n(-7 - swing)}" y2="0" ${S}/><line x1="7" y1="-16" x2="${n(7 + swing)}" y2="0" ${S}/>`
}

function arms(a: ActorFrame): string {
  const busy = a.pose !== 'idle' && a.pose !== 'walk'
  const swing = a.pose === 'hammer' ? Math.sin(a.p * Math.PI * 6) * 10 : 0
  const up = a.pose === 'celebrate' ? -26 : busy ? -8 + swing : 0
  return `<line x1="14" y1="-36" x2="26" y2="${n(-28 + up)}" ${S}/><line x1="-14" y1="-36" x2="-24" y2="${n(a.pose === 'celebrate' ? -54 : -24)}" ${S}/>`
}

function eyes(a: ActorFrame, t: number, y: number): string {
  if (a.pose === 'celebrate') return `<path d="M-10 ${y + 1} q4 -5 8 0 M2 ${y + 1} q4 -5 8 0" fill="none" ${S}/>`
  const dy = a.pose === 'think' ? -3 : 0
  const ry = t % 3000 < 120 ? 0.6 : 3.2
  const e = (cx: number) => `<ellipse cx="${cx}" cy="${y + dy}" rx="3" ry="${ry}" fill="${legacyColor('ink')}"/>`
  return e(-6) + e(6)
}

function robot(a: ActorFrame, t: number, body: string, hat: string): string {
  return legs(a, t)
    + `<rect x="-20" y="-50" width="40" height="36" rx="10" fill="${body}" ${S}/>`
    + arms(a)
    + `<rect x="-17" y="-78" width="34" height="28" rx="9" fill="${legacyColor('paper')}" ${S}/>`
    + eyes(a, t, -64)
    + hat
}

const ANTENNA = `<line x1="0" y1="-78" x2="0" y2="-88" ${S}/><circle cx="0" cy="-91" r="4" fill="${legacyColor('accent')}" ${S}/>`
const CAP = `<path d="M-18 -76 q18 -18 36 0 z" fill="${legacyColor('helper')}" ${S}/>`

function person(a: ActorFrame, t: number): string {
  return legs(a, t)
    + `<path d="M-18 -16 q0 -34 18 -34 q18 0 18 34 z" fill="${legacyColor('you')}" ${S}/>`
    + arms(a)
    + `<circle cx="0" cy="-64" r="14" fill="${legacyColor('paper')}" ${S}/>`
    + eyes(a, t, -64)
}

/** A character at its own origin (feet at 0,0). */
export function actor(a: ActorFrame, t: number): string {
  const body = a.id === 'you' ? person(a, t)
    : a.id === 'helper' ? `<g transform="scale(0.85)">${robot(a, t, legacyColor('helper'), CAP)}</g>`
    : robot(a, t, legacyColor('claude'), ANTENNA)
  return `<g class="sk-actor sk-actor--${a.id}" transform="translate(0 ${n(lift(a, t))}) scale(${a.facing} 1)">${body}</g>`
}
