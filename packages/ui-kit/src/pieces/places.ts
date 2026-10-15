import type { PlaceId } from '@sidecar/shared'
import { APP_FLOOR_H, placeHeight } from '../layout'
import { label, n, truncate } from '../svg'
import { color } from '../tokens'
import { MAX_FLOORS } from '../town'

const S = `stroke="${color('ink')}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`
const FONT = `font-family="ui-rounded, system-ui, sans-serif" font-size="13" font-weight="600"`
const win = (x: number, y: number, w = 16, h = 14) =>
  `<rect class="sk-window" x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${color('sky')}" ${S}/>`

function sign(text: string, y: number): string {
  const w = Math.min(140, 22 + truncate(text).length * 7.4)
  return `<g transform="translate(0 ${n(y)})"><rect x="${n(-w / 2)}" y="-11" width="${n(w)}" height="22" rx="6" fill="${color('paper')}" ${S}/>`
    + `<text y="5" text-anchor="middle" ${FONT} fill="${color('ink')}">${label(text)}</text></g>`
}

function app(floors: number): string {
  let s = ''
  for (let i = 0; i < floors; i++) {
    const y = -(i + 1) * APP_FLOOR_H
    s += `<rect x="-48" y="${y}" width="96" height="${APP_FLOOR_H}" fill="${color('wall')}" ${S}/>`
    s += win(-38, y + 8) + win(22, y + 8)
  }
  const top = -floors * APP_FLOOR_H
  return s
    + `<path d="M-58 ${top} L0 ${top - 34} L58 ${top} Z" fill="${color('roof')}" ${S}/>`
    + `<rect x="-10" y="-24" width="20" height="24" rx="3" fill="${color('claude')}" ${S}/>`
}

const BODY: Record<Exclude<PlaceId, 'app'>, string> = {
  service: `<rect x="-40" y="-96" width="80" height="96" rx="4" fill="${color('wall')}" ${S}/>`
    + [0, 1, 2].flatMap((r) => [0, 1].map((c) => win(-28 + c * 34, -84 + r * 24, 22, 14))).join('')
    + `<circle cx="-40" cy="-24" r="7" fill="${color('accent')}" ${S}/>`,
  database: `<path d="M-30 -66 v54 a30 10 0 0 0 60 0 v-54" fill="${color('accent')}" ${S}/>`
    + `<path d="M-30 -48 a30 10 0 0 0 60 0 M-30 -30 a30 10 0 0 0 60 0" fill="none" ${S}/>`
    + `<ellipse cx="0" cy="-66" rx="30" ry="10" fill="${color('paper')}" ${S}/>`,
  toolbox: `<path d="M-12 -30 v-10 h24 v10" fill="none" ${S}/>`
    + `<rect x="-30" y="-30" width="60" height="30" rx="4" fill="${color('claude')}" ${S}/>`
    + `<line x1="-30" y1="-20" x2="30" y2="-20" ${S}/>`,
  bookshelf: `<rect x="-34" y="-90" width="68" height="90" rx="3" fill="${color('wall')}" ${S}/>`
    + [-60, -30].map((y) => `<line x1="-34" y1="${y}" x2="34" y2="${y}" ${S}/>`).join('')
    + [-90, -60, -30].map((shelf, r) => [0, 1, 2, 3].map((i) =>
      `<rect x="${-28 + i * 14}" y="${shelf + 6}" width="10" height="22" rx="1" fill="${color((['roof', 'accent', 'you', 'claude'] as const)[(i + r) % 4]!)}" ${S}/>`).join('')).join(''),
  browser: `<rect x="-50" y="-70" width="100" height="70" rx="8" fill="${color('paper')}" ${S}/>`
    + `<line x1="-50" y1="-54" x2="50" y2="-54" ${S}/>`
    + ['fail', 'accent', 'ok'].map((c, i) => `<circle cx="${-40 + i * 9}" cy="-62" r="3" fill="${color(c as 'fail' | 'accent' | 'ok')}"/>`).join('')
    + `<path d="M-38 -40 h60 M-38 -28 h76 M-38 -16 h44" fill="none" ${S}/>`,
  cloud: `<path d="M-46 0 a18 18 0 0 1 6 -32 a24 24 0 0 1 42 -10 a20 20 0 0 1 34 16 a14 14 0 0 1 8 26 z" fill="${color('paper')}" ${S}/>`,
}

const DEFAULT_LABEL: Partial<Record<PlaceId, string>> = { app: 'Your App', service: 'Outside service' }

/** A place at its own origin (base centre at 0,0). */
export function place(id: PlaceId, o: { label?: string; floors: number }): string {
  const floors = Math.min(MAX_FLOORS, Math.max(1, Math.round(o.floors) || 1))
  const body = id === 'app' ? app(floors) : BODY[id]
  const text = o.label ?? DEFAULT_LABEL[id]
  const signY = -placeHeight(id, floors) + 18
  return `<g class="sk-place sk-place--${id}">${body}${text ? sign(text, signY) : ''}</g>`
}
