import type { FeedStep } from '@sidecar/shared'
import sample from './sample.json'

/** A sample session for the first run, played in the browser only: nothing is sent, stored or explained. */
export const DEMO = sample as { project: string; cwd: string; steps: FeedStep[] }

/** How long each sample step stays the newest, and how long the finished session rests before it starts over. */
export const DEMO_STEP_MS = 2600
export const DEMO_REST_MS = 9000

/**
 * Where the demo is `t` ms after it started: which loop, how many steps are showing, and whether
 * Claude is "working" or the session has ended. Loops forever.
 */
export function demoAt(t: number, total: number, stepMs = DEMO_STEP_MS, restMs = DEMO_REST_MS): { loop: number; count: number; done: boolean } {
  if (total <= 0) return { loop: 0, count: 0, done: true }
  const length = total * stepMs + restMs
  const at = Math.max(0, t)
  const loop = Math.floor(at / length)
  const into = at - loop * length
  const count = Math.min(total, Math.floor(into / stepMs) + 1)
  return { loop, count, done: into >= total * stepMs }
}
