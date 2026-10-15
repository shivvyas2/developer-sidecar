import type { ActionId, ActorId, EffectId, PlaceId, SceneSpec } from '@sidecar/shared'
import { clamp, easeInOut, lerp, progress } from './ease'
import { ACTOR_HOME, LANE_Y, PLACE_AT, VIEW, isActor, isPlace, placeHeight, standPoint, type Point } from './layout'
import { BEAT_MS, FX_MS, HOLD_MS } from './tokens'
import type { Town } from './town'

export type Beat = SceneSpec['beats'][number]
export interface TimedBeat { beat: Beat; start: number; end: number }
export interface Timeline { beats: TimedBeat[]; duration: number }

export type Pose = 'idle' | 'walk' | ActionId
export type PropKind = 'cable' | 'wrench' | 'magnifier' | 'book' | 'box' | 'gadget' | 'rocket' | 'parcel'

export interface ActorFrame { id: ActorId; x: number; y: number; pose: Pose; p: number; facing: 1 | -1 }
export interface PropFrame { kind: PropKind; from: Point; to: Point; p: number }
export interface FxFrame { id: EffectId; x: number; y: number; p: number }
export interface PlaceFrame { id: PlaceId; x: number; y: number; label?: string }
export interface Frame { t: number; places: PlaceFrame[]; actors: ActorFrame[]; props: PropFrame[]; fx: FxFrame[] }
export interface FrameOptions { town?: Town }

/** Lay the beats end to end. Every scene ends with a short hold on its final pose. */
export function compile(spec: SceneSpec): Timeline {
  let at = 0
  const beats = spec.beats.map((beat) => {
    const d = 'fx' in beat ? FX_MS : BEAT_MS[beat.do]
    const tb = { beat, start: at, end: at + d }
    at += d
    return tb
  })
  return { beats, duration: at + HOLD_MS }
}

const PROP_FOR: Partial<Record<ActionId, PropKind>> = {
  plugCable: 'cable', hammer: 'wrench', inspect: 'magnifier', read: 'book',
  unpack: 'box', hand: 'gadget', launch: 'rocket', ship: 'parcel',
}
/** Actions done on the spot: the actor does not walk to the target first. */
const STAY = new Set<ActionId>(['think', 'celebrate', 'speak', 'launch', 'ship'])
/** Share of a working beat spent walking there when the actor is not already in place. */
const APPROACH = 0.35

function placesFor(spec: SceneSpec, town?: Town): PlaceFrame[] {
  const labels = new Map<PlaceId, string | undefined>()
  for (const id of town?.places ?? []) labels.set(id, town?.labels[id])
  for (const c of spec.cast) if (typeof c !== 'string') labels.set(c.place, c.label ?? labels.get(c.place))
  for (const b of spec.beats) {
    const ref = 'fx' in b ? b.at : b.to
    if (ref && isPlace(ref) && !labels.has(ref)) labels.set(ref, undefined)
  }
  return [...labels].map(([id, label]) => ({ id, ...PLACE_AT[id], ...(label ? { label } : {}) }))
}

function actorsFor(spec: SceneSpec): ActorId[] {
  const ids: ActorId[] = []
  const add = (id: ActorId) => { if (!ids.includes(id)) ids.push(id) }
  for (const c of spec.cast) if (typeof c === 'string') add(c)
  for (const b of spec.beats) if ('actor' in b) add(b.actor)
  return ids
}

function propFor(kind: PropKind, at: Point, target: Point | undefined, places: Map<PlaceId, Point>, facing: 1 | -1, p: number): PropFrame {
  const hand = { x: at.x + facing * 22, y: at.y - 34 }
  const ahead = { x: hand.x + facing * 60, y: hand.y }
  switch (kind) {
    case 'cable':
      return { kind, from: hand, to: target ? { x: target.x - 40, y: target.y - 24 } : ahead, p }
    case 'gadget':
      return { kind, from: hand, to: target ? { x: target.x, y: target.y - 44 } : ahead, p }
    case 'rocket': {
      const base = places.get('app') ?? at
      return { kind, from: { x: base.x, y: base.y - 20 }, to: target ?? { x: base.x, y: 40 }, p }
    }
    case 'parcel':
      return { kind, from: hand, to: { x: VIEW.w + 40, y: LANE_Y - 20 }, p }
    case 'box':
      return { kind, from: target ?? hand, to: target ?? hand, p }
    default:
      return { kind, from: hand, to: hand, p }
  }
}

const FX_MIN_Y = 40

function fxPoint(at: string, places: Map<PlaceId, Point>, actors: Map<ActorId, ActorFrame>, town?: Town): Point {
  if (isPlace(at)) {
    const p = places.get(at) ?? PLACE_AT[at]
    // Keep the whole effect on canvas: error smoke rises ~38px above its point.
    return { x: p.x, y: Math.max(FX_MIN_Y, p.y - placeHeight(at, town?.appFloors ?? 1) - 12) }
  }
  const who = isActor(at) ? actors.get(at) ?? ACTOR_HOME[at] : actors.get('claude')
  return who ? { x: who.x, y: who.y - 104 } : { x: VIEW.w / 2, y: VIEW.h / 2 }
}

/** Where everything is at time `t` (ms). Pure: same inputs, same frame. */
export function frameAt(spec: SceneSpec, timeline: Timeline, tIn: number, opts: FrameOptions = {}): Frame {
  const t = Number.isNaN(tIn) ? 0 : clamp(tIn, 0, timeline.duration)
  const places = placesFor(spec, opts.town)
  const placeAt = new Map<PlaceId, Point>(places.map((p) => [p.id, { x: p.x, y: p.y }]))
  const actors = new Map<ActorId, ActorFrame>(
    actorsFor(spec).map((id) => [id, { id, ...ACTOR_HOME[id], pose: 'idle', p: 0, facing: 1 }]),
  )
  const props: PropFrame[] = []
  const fx: FxFrame[] = []

  const resolve = (to: string | undefined): Point | undefined => {
    if (!to) return undefined
    if (isPlace(to)) return placeAt.get(to) ?? PLACE_AT[to]
    if (isActor(to)) { const a = actors.get(to); return a ? { x: a.x, y: a.y } : ACTOR_HOME[to] }
    return undefined
  }

  for (const tb of timeline.beats) {
    if (t < tb.start) break
    const p = progress(t, tb.start, tb.end)
    const b = tb.beat
    if ('fx' in b) {
      if (b.fx === 'sparkle' && p >= 1) continue
      fx.push({ id: b.fx, ...fxPoint(b.at, placeAt, actors, opts.town), p })
      continue
    }
    const actor = actors.get(b.actor)!
    const from = { x: actor.x, y: actor.y }
    const target = resolve(b.to)
    const dest = target && !STAY.has(b.do) ? standPoint(target, from) : from
    const dist = Math.hypot(dest.x - from.x, dest.y - from.y)
    const travel = b.do === 'walkTo' ? 1 : dist > 4 ? APPROACH : 0

    let x = dest.x
    let y = dest.y
    let pose: Pose = 'idle'
    let ap = 1
    let facing: 1 | -1 = target ? (target.x < dest.x ? -1 : 1) : actor.facing
    if (p < travel) {
      const k = easeInOut(p / travel)
      x = lerp(from.x, dest.x, k)
      y = lerp(from.y, dest.y, k)
      pose = 'walk'
      ap = 0
      facing = dest.x < from.x ? -1 : 1
    } else if (p < 1) {
      pose = b.do
      ap = travel >= 1 ? 1 : (p - travel) / (1 - travel)
    }
    actors.set(b.actor, { id: b.actor, x, y, pose, p: ap, facing })

    const kind = PROP_FOR[b.do]
    if (kind && p >= travel && (p < 1 || kind === 'cable')) {
      props.push(propFor(kind, { x, y }, target, placeAt, facing, p < 1 ? ap : 1))
    }
  }

  return { t, places, actors: [...actors.values()], props, fx }
}
