import type { PlaceId, SceneSpec } from '@sidecar/shared'
import { clamp, progress } from '../ease'
import { MAX_FLOORS } from '../primitives/stack'
import type { Timeline } from '../timeline'
import { HOLD_MS } from '../tokens'
import type { Town } from '../town'
import { slotsFor, type Slots } from './layout'

/** The stage frame's numbers. The caller computes them; render only draws them. */
export interface Readout {
  step: number
  files: number
  tokens: number
  now: string
  elapsed: string
  live: boolean
  /** Replaces the strip's LIVE or REPLAY block, e.g. DONE, NEEDS YOU or OFFLINE. */
  tag?: string
  /** Session progress, 0..1, for the session arc. */
  session?: number
  /** The project name in the header. */
  project?: string
}

export interface CtxOptions { town?: Town; frame?: boolean; readout?: Readout }

export interface SceneCtx {
  spec: SceneSpec
  timeline: Timeline
  /** Time in ms, clamped to the timeline. */
  t: number
  /** Overall progress 0..1 over the beats (the final hold is not counted). */
  p: number
  /** Progress 0..1 of beat `i`; 0 for a beat that does not exist. */
  beatP: (i: number) => number
  town: Town
  /** Every place on the sheet: the town's plus the cast's. */
  places: Set<PlaceId>
  /** Place labels, the cast's winning over the town's. */
  labels: Partial<Record<PlaceId, string>>
  slots: Slots
  frame: boolean
  readout?: Readout
  /** The spec has an `error` beat anywhere. */
  failed: boolean
  /** The spec has a `success` beat anywhere. */
  succeeded: boolean
}

export function makeCtx(spec: SceneSpec, timeline: Timeline, tIn: number, opts: CtxOptions = {}): SceneCtx {
  const t = Number.isNaN(tIn) ? 0 : clamp(tIn, 0, timeline.duration)
  const active = Math.max(0, timeline.duration - HOLD_MS)
  const p = active > 0 ? clamp(t / active) : t > 0 ? 1 : 0
  const beatP = (i: number) => {
    const b = timeline.beats[i]
    return b ? progress(t, b.start, b.end) : 0
  }
  const base = opts.town ?? { places: [], labels: {}, appFloors: 1 }
  const town: Town = { ...base, appFloors: Math.min(MAX_FLOORS, Math.max(1, Math.round(base.appFloors) || 1)) }
  const places = new Set<PlaceId>(['app', ...town.places])
  const labels: Partial<Record<PlaceId, string>> = { ...town.labels }
  for (const c of spec.cast) {
    if (typeof c === 'string') continue
    places.add(c.place)
    if (c.label) labels[c.place] = c.label
  }
  const fx = spec.beats.flatMap((b) => ('fx' in b ? [b.fx] : []))
  return {
    spec, timeline, t, p, beatP, town, places, labels,
    slots: slotsFor(!!opts.frame), frame: !!opts.frame,
    ...(opts.readout ? { readout: opts.readout } : {}),
    failed: fx.includes('error'),
    succeeded: fx.includes('success'),
  }
}
