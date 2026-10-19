import type { Attention, FeedStep } from '@sidecar/shared'

type Seen = Pick<FeedStep, 'category' | 'status'>

export type Checks = 'pass' | 'fail' | 'none'

/** How the last check run that finished went, or none when Claude hasn't run any. */
export function checksOf(steps: readonly Seen[]): Checks {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (s.category === 'test' && (s.status === 'ok' || s.status === 'failed')) return s.status === 'ok' ? 'pass' : 'fail'
  }
  return 'none'
}

export type Health = 'ok' | 'fix' | 'you' | 'working'

/** The status light's words, short enough for the frame. */
export const HEALTH_WORD: Record<Health, string> = { ok: 'ALL GOOD', fix: 'NEEDS A FIX', you: 'NEEDS YOU', working: 'WORKING' }

/** Steps that change nothing, so their outcome says nothing about whether the app works. */
const QUIET = new Set<FeedStep['category']>(['prompt', 'read'])

/**
 * One word for how things stand: Claude needs you, something is broken (the last checks failed, or
 * the last step that changes something failed and nothing has worked since), Claude is still at it,
 * or all good. `attention` is left out for an older moment, such as a replay.
 */
export function healthOf(steps: readonly Seen[], attention?: Attention): Health {
  if (attention === 'permission') return 'you'
  if (checksOf(steps) === 'fail') return 'fix'
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (QUIET.has(s.category) || s.status === 'running' || s.status === 'interrupted') continue
    if (s.status === 'failed') return 'fix'
    break
  }
  return attention === 'working' ? 'working' : 'ok'
}
