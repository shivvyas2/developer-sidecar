import type { EffectId } from '@sidecar/shared'
import { clamp, easeOutBack } from '../ease'
import { n } from '../svg'
import { legacyColor } from '../tokens'

const S = `stroke="${legacyColor('ink')}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`
const STAR = 'M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z'
const pop = (p: number) => n(easeOutBack(clamp(p * 2)), 3)
const dots = (t: number, y: number, dx = 0) =>
  [-10, 0, 10].map((x, i) => `<circle cx="${x + dx}" cy="${y}" r="3" fill="${legacyColor('ink')}" opacity="${Math.floor(t / 300) % 3 === i ? 1 : 0.3}"/>`).join('')

/** An effect at its own origin (the point it floats at). */
export function effect(id: EffectId, p: number, t: number): string {
  const body = ((): string => {
    switch (id) {
      case 'sparkle': {
        const r = 14 + p * 16
        const s = n(Math.sin(p * Math.PI), 3)
        return [0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4
          return `<path d="${STAR}" fill="${legacyColor('accent')}" transform="translate(${n(Math.cos(a) * r)} ${n(Math.sin(a) * r)}) scale(${s})"/>`
        }).join('')
      }
      case 'success':
        return `<g transform="scale(${pop(p)})"><circle r="16" fill="${legacyColor('ok')}" ${S}/><path d="M-7 0 l5 5 l9 -10" fill="none" stroke="${legacyColor('paper')}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`
      case 'error':
        return [0, 1, 2].map((i) => `<circle cx="${(i - 1) * 14}" cy="${n(-p * 20 - i * 6)}" r="${10 - i * 2}" fill="${legacyColor('smoke')}" opacity="${n(1 - p * 0.5, 2)}"/>`).join('')
          + `<g transform="scale(${pop(p)})"><circle r="16" fill="${legacyColor('fail')}" ${S}/><path d="M-6 -6 l12 12 M6 -6 l-12 12" fill="none" stroke="${legacyColor('paper')}" stroke-width="4" stroke-linecap="round"/></g>`
      case 'thinking':
        return `<g transform="scale(${pop(p)})"><circle cx="-14" cy="10" r="4" fill="${legacyColor('paper')}" ${S}/><circle cx="-6" cy="-2" r="6" fill="${legacyColor('paper')}" ${S}/><ellipse cx="18" cy="-26" rx="28" ry="18" fill="${legacyColor('paper')}" ${S}/>${dots(t, -26, 18)}</g>`
      case 'speech':
        return `<g transform="scale(${pop(p)})"><g transform="translate(24 0)"><path d="M-30 -48 h60 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-38 l-12 12 v-12 h-10 a8 8 0 0 1 -8 -8 v-18 a8 8 0 0 1 8 -8 z" fill="${legacyColor('paper')}" ${S}/>${dots(t, -31)}</g></g>`
    }
  })()
  return `<g class="sk-fx sk-fx--${id}">${body}</g>`
}
