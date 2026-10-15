import { clamp, easeInOut, lerp } from '../ease'
import { iso, type P } from '../iso'
import { isoBlock } from '../primitives/block'
import { callout } from '../primitives/callout'
import { indexCard } from '../primitives/card'
import { connector } from '../primitives/connector'
import { cursor } from '../primitives/cursor'
import { dial, type DialState } from '../primitives/dial'
import { cardDrawer } from '../primitives/drawer'
import { hand, helperHand } from '../primitives/hand'
import { indicatorRow } from '../primitives/indicators'
import { readout } from '../primitives/readout'
import { isoStack } from '../primitives/stack'
import { stamp } from '../primitives/stamp'
import { instrumentModule, magnifier, packageBlock } from '../primitives/tools'
import { n } from '../svg'
import { color, FONTS } from '../tokens'
import type { SceneCtx } from './context'
import {
  APP, BLOCKS, appTopZ, at, blockBox, drawerCards, drawerFrontY, drawerLabel, pad, subjectFile, tag, type TownState,
} from './layout'

/** Draws a scene's moving parts at ctx.t. The town and the frame are drawn by render. */
export type Animator = (ctx: SceneCtx) => string

const HAND = 0.7
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
const mix = (a: P, b: P, k: number): P => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) })
const g = (cls: string, body: string) => `<g class="sk-anim sk-anim--${cls}">${body}</g>`

/** A cross in accent: a step that failed. */
const cross = (c: P, size = 16) =>
  `<text class="sk-fail" x="${n(c.x)}" y="${n(c.y)}" font-family="${FONTS.mono}" font-size="${size}" font-weight="700" `
  + `text-anchor="middle" fill="${color('accent')}">✕</text>`

const outcome = (ctx: SceneCtx): DialState =>
  ctx.p >= 1 && ctx.failed ? 'fail' : ctx.p >= 1 && ctx.succeeded ? 'ok' : 'run'

/* ---------- the drawer and its cards ---------- */

const cardTitle = (ctx: SceneCtx, fallback: string) => subjectFile(ctx.spec.caption) ?? fallback
/** The front card's top edge in the drawer, and where it stands when it sticks up out of it. */
const frontSlot = (ctx: SceneCtx) => {
  const { at: d, w } = ctx.slots.drawer
  const cards = drawerCards(ctx)
  const y = d.y + 9 + (Math.max(1, cards.length) - 1) * 12
  return { x: d.x + 4, y, w: w - 8, up: y - 42, num: cards.at(-1)?.num ?? '001', cards }
}
const drawer = (ctx: SceneCtx, lifted?: string, cards = drawerCards(ctx)) =>
  cardDrawer(ctx.slots.drawer.at, { cards, label: drawerLabel(ctx), width: ctx.slots.drawer.w, ...(lifted ? { lifted } : {}) })

/**
 * The hand pressing a card's top edge at its right end, from above and to the left:
 * it stays clear of the card's tab and text, and of the service callout below.
 */
const pressOn = (card: P, w: number) => hand({ x: card.x + w - 6, y: card.y + 1 }, { pose: 'press', facing: -1, scale: HAND })

/** create: the hand pushes a new card along an arc into the drawer; Your App's new floor is dashed until it lands. */
const create: Animator = (ctx) => {
  const f = frontSlot(ctx)
  const k = easeInOut(seg(ctx.p, 0, 0.85))
  const from = { x: 236, y: 82 }, to = { x: f.x, y: f.up }
  const c = mix(from, to, k)
  c.y -= Math.sin(Math.PI * k) * 24
  const w = lerp(110, f.w, k)
  const card = indexCard(c, { num: f.num, title: cardTitle(ctx, 'new file'), lines: 3, state: 'inserting', width: w })
  return g('create', drawer(ctx, f.num) + card + pressOn(c, w))
}

/** edit: the front card lifts out, a line is struck and rewritten in accent, then it settles back. */
const edit: Animator = (ctx) => {
  const f = frontSlot(ctx)
  const lift = easeInOut(seg(ctx.p, 0, 0.3)) - easeInOut(seg(ctx.p, 0.8, 1))
  const y = f.up - 30 * lift
  const editing = ctx.p >= 0.3
  const prog = seg(ctx.p, 0.3, 0.8)
  const card = indexCard({ x: f.x, y }, {
    num: f.num, title: cardTitle(ctx, 'file'), lines: 4, width: f.w,
    state: editing ? 'editing' : ctx.p > 0 ? 'lifted' : 'rest', progress: prog,
  })
  return g('edit', drawer(ctx, f.num) + card + pressOn({ x: f.x, y }, f.w))
}

/** read: three cards fan up out of the drawer and a magnifier crosses the front one. */
const read: Animator = (ctx) => {
  const f = frontSlot(ctx)
  const e = easeInOut(seg(ctx.p, 0, 0.35))
  const cw = 120, cx = f.x + f.w / 2
  let out = drawer(ctx, f.num)
  const fan = [{ a: -9, num: pad(f.cards.length - 2, 3) }, { a: 8, num: pad(f.cards.length - 1, 3) }]
  fan.forEach((c, i) => {
    const bob = Math.sin(ctx.p * Math.PI * 2 + i * 1.7) * 1.5 * e
    const y = f.y - 34 * e + bob
    out += `<g transform="rotate(${n(c.a * e)} ${n(cx)} ${n(y + 54)})">`
      + indexCard({ x: cx - cw / 2, y }, { num: c.num, title: '', lines: 3, width: cw }) + `</g>`
  })
  const y = f.y - 46 * e
  out += indexCard({ x: cx - cw / 2, y }, { num: f.num, title: cardTitle(ctx, 'file'), lines: 4, state: ctx.p > 0 ? 'lifted' : 'rest', width: cw })
  const m = seg(ctx.p, 0.3, 1)
  out += magnifier({ x: cx - cw / 2 + 14 + (cw - 28) * m, y: y + 26 })
  return g('read', out)
}

/* ---------- instruments ---------- */

/** install: a package lifts off the pallet and settles on Your App while the dial sweeps to 100. */
const install: Animator = (ctx) => {
  const s = ctx.slots
  const k = easeInOut(seg(ctx.p, 0, 0.75))
  const dest = iso(15, 8, appTopZ(ctx.town.appFloors), s.app)
  const o = mix(s.toolbox, dest, k)
  o.y -= Math.sin(Math.PI * k) * 46
  const state: DialState = ctx.failed && ctx.p >= 1 ? 'fail' : 'run'
  return g('install', packageBlock(o, seg(ctx.p, 0.75, 1))
    + dial(s.dial.c, s.dial.r, { progress: ctx.p, value: pad(Math.round(ctx.p * 100), 2), title: 'install', unit: 'pct', state }))
}

/** test: the dial runs, the hand points at it; ink check for passed, accent cross for failed. */
const test: Animator = (ctx) => {
  const { c, r } = ctx.slots.dial
  const prog = easeInOut(ctx.p)
  return g('test', dial(c, r, { progress: prog, value: pad(Math.round(prog * 100), 2), title: 'checks', unit: 'pct', state: outcome(ctx) })
    + hand({ x: c.x - r - 16, y: c.y + 4 }, { pose: 'point', facing: -1, scale: HAND }))
}

/** run: the indicator row lights in sequence and a small readout counts up. */
const run: Animator = (ctx) => {
  const { c } = ctx.slots.dial
  const w = ctx.frame ? 86 : 104
  const box = { x: c.x - w / 2, y: c.y - 44 }
  const row = { x: c.x - 30, y: c.y + 34 }
  let out = readout(box, w, [{ k: 'CYCLES', v: pad(Math.round(ctx.p * 999), 3) }])
    + indicatorRow(row, ['LT', 'P', 'TC', 'GO'], Math.floor(ctx.p * 4))
  if (ctx.failed && ctx.p >= 1) out += cross({ x: row.x + 82, y: row.y + 6 }, 14)
  return g('run', out)
}

/* ---------- places ---------- */

/** connect: the service block fades in (dashed at first), then the connector draws from Your App to it. */
const connect: Animator = (ctx) => {
  const s = ctx.slots
  const solid = ctx.p > 0.3
  const fade = 0.35 + 0.65 * seg(ctx.p, 0, 0.3)
  let out = `<g opacity="${n(solid ? 1 : fade, 2)}">${isoBlock(s.app, blockBox(s, 'service'), 'service', { dashed: !solid })}</g>`
  const from = iso(APP.w, APP.d * 0.4, appTopZ(ctx.town.appFloors) - 8, s.app)
  const to = at(s, s.world.service, 2, 18, 30)
  out += connector(from, to, seg(ctx.p, 0.3, 1))
  if (ctx.failed && ctx.p >= 1) out += cross(at(s, s.world.service, BLOCKS.service.w / 2, BLOCKS.service.d / 2, BLOCKS.service.h + 12), 20)
  return g('connect', out)
}

/** mcp: an instrument module travels from the pallet into the hand, which closes on it. */
const mcp: Animator = (ctx) => {
  const s = ctx.slots
  const k = easeInOut(seg(ctx.p, 0, 0.7))
  const grip = { x: s.hand.x, y: s.hand.y }
  const held = ctx.p >= 0.7
  const name = ctx.labels.toolbox ? tag(ctx.labels.toolbox, 8) : 'MCP'
  let out = ''
  if (!held) {
    const m = mix({ x: s.toolbox.x, y: s.toolbox.y - 20 }, { x: grip.x, y: grip.y - 8 }, k)
    m.y -= Math.sin(Math.PI * k) * 30
    out += instrumentModule(m)
  }
  out += hand(grip, { pose: 'hold', scale: HAND, ...(held ? { holding: 'module' as const } : {}) })
  out += callout({ x: grip.x - 2, y: grip.y - 12 }, { x: grip.x - 8, y: grip.y - 30 }, name, 'MCP TOOL', { align: 'end' })
  return g('mcp', out)
}

/** data: the database block extrudes in three slabs under the pressing hand. */
const data: Animator = (ctx) => {
  const s = ctx.slots
  const { h, w, d } = BLOCKS.data
  const slab = h / 3
  let out = isoBlock(s.app, blockBox(s, 'data'), 'data', { dashed: true })
  let top = 0
  for (let i = 0; i < 3; i++) {
    const k = seg(ctx.p, i / 3, (i + 1) / 3)
    if (k <= 0) continue
    const box = { ...blockBox(s, 'data'), z: i * slab, h: slab * k }
    out += isoBlock(s.app, box, 'data')
    top = i * slab + slab * k
  }
  out += hand(at(s, s.world.data, w / 2, d / 2, top), { pose: 'press', facing: -1, scale: HAND })
  return g('data', out)
}

/** git: the drawer closes on its cards and a SAVED stamp lands. */
const git: Animator = (ctx) => {
  const all = drawerCards(ctx)
  const k = easeInOut(seg(ctx.p, 0, 0.6))
  const left = Math.round(all.length * (1 - k))
  let out = drawer(ctx, undefined, all.slice(0, left))
  if (ctx.p > 0.6) {
    const d = ctx.slots.drawer.at
    out += stamp({ x: d.x + 44, y: drawerFrontY(ctx, 0) - 30 }, ctx.readout ? `SAVED ${pad(ctx.readout.step, 3)}` : 'SAVED')
  }
  return g('git', out)
}

/** A quadratic arc from `a` to `b` bowing `lift` above the higher end: its SVG path and its point at `t`. */
const arc = (a: P, b: P, lift: number) => {
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift }
  return {
    d: `M${n(a.x)},${n(a.y)} Q${n(c.x)},${n(c.y)} ${n(b.x)},${n(b.y)}`,
    at: (t: number): P => mix(mix(a, c, t), mix(c, b, t), t),
  }
}

/**
 * deploy: Your App lifts along a dashed arc to the cloud, shrinking, leaving its dashed
 * outline behind. The stack's top centre rides the drawn arc, from its place on the
 * sheet to where it stands, small, on the cloud.
 */
const deploy: Animator = (ctx) => {
  const s = ctx.slots
  const floors = ctx.town.appFloors
  const k = easeInOut(ctx.p)
  const sc = lerp(1, 0.32, k)
  const topZ = appTopZ(floors)
  /** The top centre of a stack at `scale`, relative to its origin. */
  const top = (scale: number) => ({ x: (APP.w - APP.d) / 2 * 0.866 * scale, y: ((APP.w + APP.d) / 2 * 0.5 - topZ) * scale })
  const startTop = { x: s.app.x + top(1).x, y: s.app.y + top(1).y }
  // On the cloud the scaled stack's foot sits on the cloud's top, so its top is that much higher.
  const endTop = { x: s.cloud.x, y: s.cloud.y - 26 - topZ * 0.32 }
  const path = arc(startTop, endTop, 12)
  let out = `<path d="${path.d}" fill="none" stroke="${color('ink')}" stroke-width=".8" stroke-dasharray="3 3"/>`
  if (ctx.p > 0) {
    const b = path.at(k), t = top(sc)
    out += isoStack({ x: b.x - t.x, y: b.y - t.y }, floors, { scale: sc })
  }
  if (ctx.failed && ctx.p >= 1) out += cross({ x: s.cloud.x + 30, y: s.cloud.y - 26 })
  return g('deploy', out)
}

/* ---------- people ---------- */

/** subagent: the helper hand slides in from the left with its tiny dial, toward Claude's hand. */
const helper: Animator = (ctx) => {
  const s = ctx.slots
  const k = easeInOut(ctx.p)
  const x = lerp(-20, s.hand.x - 30, k)
  return g('helper', helperHand({ x, y: s.hand.y - 8 }, ctx.p, -1) + hand(s.hand, { pose: 'point', scale: HAND }))
}

/** prompt: your cursor types your words into a speech callout. */
const prompt: Animator = (ctx) => {
  const words = ctx.spec.caption.trim()
  const shown = words.slice(0, Math.ceil(words.length * seg(ctx.p, 0, 0.8)))
  return g('prompt', cursor({ x: 60, y: 222 }, shown) + hand(ctx.slots.hand, { pose: 'point', scale: HAND }))
}

/**
 * fallback: the hand hovers by a small spinning tick ring. The ring is the dial's
 * tick ring rather than the session arc, whose knob and pointer stand too far out
 * at this size.
 */
const generic: Animator = (ctx) => {
  const s = ctx.slots
  const bob = Math.sin(ctx.t / 300) * 3
  const c = { x: s.hand.x - 24, y: s.hand.y - 30 }
  const spin = (ctx.t * 0.24) % 360
  return g('thinking', `<g class="sk-spinner" transform="rotate(${n(spin)} ${n(c.x)} ${n(c.y)})">${dial(c, 10, { progress: 0.35, value: '', title: '' })}</g>`
    + hand({ x: s.hand.x, y: s.hand.y + bob }, { pose: 'point', scale: HAND }))
}

export const ANIMATORS: Record<string, Animator> = {
  'place-brick': create,
  'tighten-bolt': edit,
  'read-bookshelf': read,
  'unpack-toolbox': install,
  'inspect-app': test,
  'start-engine': run,
  'connect-service': connect,
  'mcp-gadget': mcp,
  'build-cabinets': data,
  'ship-box': git,
  'launch-cloud': deploy,
  'helper-joins': helper,
  'user-asks': prompt,
  'thinking': generic,
}

/** Own keys only: a scene id such as '__proto__' or 'toString' must not reach Object.prototype. */
export const animatorFor = (scene: string): Animator => (Object.hasOwn(ANIMATORS, scene) ? ANIMATORS[scene]! : generic)

/** How a scene's animator changes the static town this frame. */
export function townState(ctx: SceneCtx): TownState {
  switch (ctx.spec.scene) {
    case 'place-brick': return { app: ctx.p < 0.8 ? 'building' : 'solid', drawer: true }
    case 'tighten-bolt': case 'read-bookshelf': case 'ship-box': return { drawer: true }
    case 'unpack-toolbox': return { hide: ['toolbox'] }
    case 'connect-service': return { hide: ['service'] }
    case 'build-cabinets': return { hide: ['database'] }
    case 'launch-cloud': return ctx.p > 0 ? { app: 'ghost' } : {}
    default: return {}
  }
}
