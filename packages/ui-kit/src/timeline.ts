import type { SceneSpec } from '@sidecar/shared'
import { BEAT_MS, FX_MS, HOLD_MS } from './tokens'

export type Beat = SceneSpec['beats'][number]
export interface TimedBeat { beat: Beat; start: number; end: number }
export interface Timeline { beats: TimedBeat[]; duration: number }

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
