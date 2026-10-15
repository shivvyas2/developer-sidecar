import type { PlaceId } from '@sidecar/shared'
import { iso, type P } from '../iso'
import { callout } from '../primitives/callout'
import { cardDrawer, type DrawerCard } from '../primitives/drawer'
import { isoBlock, type Box } from '../primitives/block'
import { isoStack } from '../primitives/stack'
import { cloud } from '../primitives/cloud'
import { packageBlock } from '../primitives/tools'
import type { SceneCtx } from './context'

/** World positions (iso units) are relative to the app stack's origin. */
export interface Slots {
  app: P
  world: { service: P; data: P; auth: P }
  cloud: P
  drawer: { at: P; w: number }
  dial: { c: P; r: number }
  hand: P
  /** The toolbox pallet: the drawer's neighbour, as an iso world origin on screen. */
  toolbox: P
  /** Where each place's callout label sits. Fixed per slot, so labels never meet. */
  labels: { app: P; service: P; data: P; auth: P; cloud: P; toolbox: P }
  /** The readout panel, only when framed. */
  panel?: { at: P; w: number }
}

/** The sheet without the frame (the kit gallery). */
export const SLOTS: Slots = {
  app: { x: 260, y: 244 },
  world: { service: { x: 95, y: -12 }, data: { x: -50, y: 48 }, auth: { x: 62, y: 72 } },
  cloud: { x: 470, y: 70 },
  drawer: { at: { x: 450, y: 196 }, w: 160 },
  dial: { c: { x: 560, y: 92 }, r: 26 },
  hand: { x: 330, y: 150 },
  toolbox: { x: 486, y: 136 },
  labels: {
    app: { x: 214, y: 160 }, service: { x: 390, y: 256 }, data: { x: 96, y: 300 },
    auth: { x: 284, y: 318 }, cloud: { x: 446, y: 86 }, toolbox: { x: 516, y: 176 },
  },
}

/**
 * With the frame the readout panel takes the dial's corner, so the dial moves in
 * beside the service, the cloud comes in under the session arc's end and the hand
 * rests a little higher, clear of the dial.
 */
export const FRAMED: Slots = {
  ...SLOTS,
  cloud: { x: 400, y: 86 },
  dial: { c: { x: 398, y: 176 }, r: 26 },
  hand: { x: 292, y: 140 },
  labels: { ...SLOTS.labels, cloud: { x: 362, y: 104 } },
  panel: { at: { x: 440, y: 20 }, w: 178 },
}

export const slotsFor = (frame: boolean): Slots => (frame ? FRAMED : SLOTS)

/* App stack geometry, mirroring primitives/stack. */
export const APP = { w: 60, d: 46, base: 26, floor: 22 } as const
export const appTopZ = (floors: number) => APP.base + floors * APP.floor
export const BLOCKS: Record<'service' | 'data' | 'auth', { w: number; d: number; h: number }> = {
  service: { w: 36, d: 36, h: 46 },
  data: { w: 32, d: 32, h: 30 },
  auth: { w: 22, d: 22, h: 8 },
}

/** The screen point of a world point on a slot block. */
export const at = (s: Slots, w: P, dx: number, dy: number, z: number): P => iso(w.x + dx, w.y + dy, z, s.app)
export const blockBox = (s: Slots, which: 'service' | 'data' | 'auth', h?: number): Box => {
  const b = BLOCKS[which], w = s.world[which]
  return { x: w.x, y: w.y, z: 0, w: b.w, d: b.d, h: h ?? b.h }
}

/** Cut a label for a callout slot: upper case, at most `max` characters. */
export const tag = (s: string, max = 10): string => {
  const t = [...s.trim().toUpperCase()]
  return t.length > max ? `${t.slice(0, max - 1).join('')}…` : t.join('')
}

/** The file a caption names ("Creating users.ts" gives users.ts), if any. */
export const subjectFile = (caption: string): string | undefined => {
  const all = caption.match(/[\w@-]+(?:\.[\w-]+)+/g)
  return all?.at(-1)
}

export const pad = (v: number, width: number): string =>
  String(Math.max(0, Math.floor(Number.isFinite(v) ? v : 0))).padStart(width, '0')

/** The drawer's cards: 3 to 6 numbered edges, the front one is the step's file. */
export const drawerCards = (ctx: SceneCtx): DrawerCard[] => {
  const files = ctx.readout?.files ?? 0
  // a missing, zero, negative or non-finite count falls back to the town's size
  const want = Number.isFinite(files) && files >= 1 ? Math.floor(files) : ctx.town.appFloors * 3
  const count = Math.min(6, Math.max(3, want))
  return Array.from({ length: count }, (_, i) => ({ num: pad(i + 1, 3), name: '' }))
}
export const drawerLabel = (ctx: SceneCtx): string => {
  const files = ctx.readout?.files ?? drawerCards(ctx).length
  return `FILES · ${pad(files, 2)}`
}
/** Where the drawer's front begins, as cardDrawer lays it out. */
export const drawerFrontY = (ctx: SceneCtx, cards = drawerCards(ctx).length): number =>
  ctx.slots.drawer.at.y + 9 + Math.max(1, cards) * 12 + 4

/** What the scene's animator does to the static town this frame. */
export interface TownState {
  app?: 'solid' | 'building' | 'ghost'
  /** Places the animator draws itself. */
  hide?: PlaceId[]
  /** The animator draws the drawer itself (it moves). */
  drawer?: boolean
}

const PLACE_ORDER: PlaceId[] = ['bookshelf', 'toolbox', 'cloud', 'database', 'service', 'app', 'browser']

const wrap = (id: string, body: string) => `<g class="sk-place sk-place--${id}">${body}</g>`

/**
 * The persistent sheet: Your App always, plus every place in the town or the cast,
 * each with its callout at its fixed label slot. `bookshelf` is the card drawer,
 * `toolbox` the package pallet beside it and `browser` the auth block.
 */
export function town(ctx: SceneCtx, state: TownState = {}): string {
  const s = ctx.slots
  const hide = new Set(state.hide ?? [])
  const floors = ctx.town.appFloors
  const label = (id: PlaceId, fallback: string) => tag(ctx.labels[id] ?? fallback)
  let out = ''
  for (const id of PLACE_ORDER) {
    if (id !== 'app' && !ctx.places.has(id)) continue
    const hidden = hide.has(id)
    switch (id) {
      case 'app': {
        const top = appTopZ(floors)
        const mode = state.app ?? 'solid'
        const body = mode === 'ghost'
          ? ghostStack(s.app, floors)
          : isoStack(s.app, floors, { building: mode === 'building' })
        out += wrap(id, body + callout(iso(APP.w / 2, APP.d / 2, top, s.app), s.labels.app, 'YOUR APP', `FLOOR ${pad(floors, 2)}`, { align: 'end' }))
        break
      }
      case 'service': {
        const top = at(s, s.world.service, BLOCKS.service.w / 2, 4, BLOCKS.service.h)
        out += wrap(id, (hidden ? '' : isoBlock(s.app, blockBox(s, 'service'), 'service'))
          + callout(top, s.labels.service, label('service', 'SERVICE'), 'SERVICE'))
        break
      }
      case 'database': {
        const top = at(s, s.world.data, 4, BLOCKS.data.d / 2, BLOCKS.data.h / 2)
        out += wrap(id, (hidden ? '' : isoBlock(s.app, blockBox(s, 'data'), 'data'))
          + callout(top, s.labels.data, 'DATABASE', ctx.labels.database ? tag(ctx.labels.database) : 'TABLES'))
        break
      }
      case 'browser': {
        const top = at(s, s.world.auth, BLOCKS.auth.w / 2, BLOCKS.auth.d / 2, BLOCKS.auth.h)
        out += wrap(id, (hidden ? '' : isoBlock(s.app, blockBox(s, 'auth'), 'auth'))
          + callout(top, s.labels.auth, 'AUTH', ctx.labels.browser ? tag(ctx.labels.browser) : 'SIGN-IN'))
        break
      }
      case 'cloud':
        out += wrap(id, (hidden ? '' : cloud(s.cloud))
          + callout({ x: s.cloud.x - 12, y: s.cloud.y }, s.labels.cloud, 'CLOUD', ctx.labels.cloud ? tag(ctx.labels.cloud, 8) : undefined))
        break
      case 'toolbox':
        if (!hidden) {
          out += wrap(id, packageBlock(s.toolbox, 0)
            + callout(iso(30, 15, 4, s.toolbox), s.labels.toolbox, 'PACKAGES', ctx.labels.toolbox ? tag(ctx.labels.toolbox, 8) : undefined))
        }
        break
      case 'bookshelf':
        if (!state.drawer) out += wrap(id, cardDrawer(s.drawer.at, { cards: drawerCards(ctx), label: drawerLabel(ctx), width: s.drawer.w }))
        break
    }
  }
  return out
}

/** Your App's outline left behind when it lifts off to the cloud: one dashed volume. */
export const ghostStack = (o: P, floors: number): string =>
  `<g class="sk-stack sk-stack--ghost">${isoBlock(o, { x: 0, y: 0, z: 0, w: APP.w, d: APP.d, h: appTopZ(floors) }, 'app', { dashed: true })}</g>`
