import type { CityScene, SceneKind } from './scenes'

/**
 * Keeps the town in step with Claude. At most one scene waits behind the one playing, so a burst never
 * leaves the town running behind; scenes of the same kind fold into the waiting one ("Reading 10 files").
 * The camera zooms out when work lands on several buildings in a short time, and follows otherwise.
 */

export const BURST_WINDOW_MS = 4000
export const BURST_SPOTS = 3

export interface PacerState {
  playing: CityScene | null
  waiting: CityScene | null
  /** Where scenes arrived lately, for the camera. */
  recent: { at: string; t: number }[]
}

export const initialPacer: PacerState = { playing: null, waiting: null, recent: [] }

export type PacerAction =
  | { type: 'arrive'; scenes: CityScene[]; t: number }
  /** A scene ended. Naming it keeps a scene that already gave way (to a catch-up) from ending the one that replaced it. */
  | { type: 'done'; t: number; scene?: CityScene }
  | { type: 'catchUp'; scene: CityScene; t: number }

const PLURAL: Partial<Record<SceneKind, (n: number) => string>> = {
  blueprint: (n) => `Reading ${n} files`,
  bricks: (n) => `Making ${n} new files`,
  scaffold: (n) => `Changing ${n} files`,
  paint: (n) => `Restyling ${n} files`,
  delivery: (n) => `Adding ${n} sets of building blocks`,
  toolbox: (n) => `Running ${n} commands`,
  library: (n) => `Looking up ${n} things online`,
  inspect: (n) => `Running checks ${n} times`,
}

/** The caption for `count` steps of one kind; a single step keeps its own caption. */
export function mergeCaption(kind: SceneKind, count: number, caption: string): string {
  return count > 1 && PLURAL[kind] ? PLURAL[kind](count) : caption
}

function merge(into: CityScene, s: CityScene): CityScene {
  const count = into.count + s.count
  return { ...s, stepIds: [...into.stepIds, ...s.stepIds], count, caption: mergeCaption(s.kind, count, s.caption) }
}

const note = (recent: PacerState['recent'], scenes: CityScene[], t: number) =>
  [...recent.filter((r) => t - r.t < BURST_WINDOW_MS), ...scenes.map((s) => ({ at: s.at, t }))]

export function pace(s: PacerState, a: PacerAction): PacerState {
  switch (a.type) {
    case 'arrive': {
      let { playing, waiting } = s
      for (const scene of a.scenes) {
        if (!playing) playing = scene
        else if (waiting && waiting.kind === scene.kind) waiting = merge(waiting, scene)
        else waiting = scene
      }
      return { playing, waiting, recent: note(s.recent, a.scenes, a.t) }
    }
    case 'done':
      if (a.scene && a.scene !== s.playing) return s
      return { ...s, playing: s.waiting, waiting: null }
    case 'catchUp':
      return { playing: a.scene, waiting: null, recent: note(s.recent, [a.scene], a.t) }
  }
}

export function cameraMode(s: PacerState, t: number): { mode: 'follow'; at: string } | { mode: 'overview'; at: string[] } {
  const spots = [...new Set(s.recent.filter((r) => t - r.t < BURST_WINDOW_MS).map((r) => r.at))]
  if (spots.length >= BURST_SPOTS) return { mode: 'overview', at: spots }
  return { mode: 'follow', at: s.waiting?.at ?? s.playing?.at ?? s.recent.at(-1)?.at ?? 'site-office' }
}

/** What a shown step looked like when its scene was chosen. */
export interface SceneKey { id: string; status: string; waiting: boolean }

/**
 * A step arrives running and finishes later; Claude can start waiting on you after it arrived. When the step on
 * show turns out to have failed, been stopped, or to be waiting on you, its scene plays again with that overlay.
 */
export function needsRescene(prev: SceneKey | null, next: SceneKey): boolean {
  if (!prev || prev.id !== next.id) return false
  if (next.waiting && !prev.waiting) return true
  return prev.status !== next.status && (next.status === 'failed' || next.status === 'interrupted')
}
