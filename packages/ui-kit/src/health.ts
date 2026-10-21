import { checksOf, isStopped, type Attention, type FeedStep } from '@sidecar/shared'

// checksOf lives in shared, so the recap and the status light read the checks the same way
export { checksOf, type Checks } from '@sidecar/shared'

type Seen = Pick<FeedStep, 'category' | 'status'> & Partial<Pick<FeedStep, 'output'>>

export type Health = 'ok' | 'fix' | 'you' | 'working'

/** The status light's words, short enough for the frame. */
export const HEALTH_WORD: Record<Health, string> = { ok: 'ALL GOOD', fix: 'NEEDS A FIX', you: 'NEEDS YOU', working: 'WORKING' }
/** The status light's colour for each state. */
export const HEALTH_LIGHT: Record<Health, 'ok' | 'alert' | 'busy'> = { ok: 'ok', fix: 'alert', you: 'alert', working: 'busy' }

/** Claude is waiting on its person: a permission prompt, or its turn ended and it wants the next message. */
export const needsYou = (attention: Attention | undefined): boolean => attention === 'permission' || attention === 'idle'

/** Steps that change nothing, so their outcome says nothing about whether the app works. */
const QUIET = new Set<FeedStep['category']>(['prompt', 'read'])

/**
 * One word for how things stand: Claude needs you, something is broken (the last checks failed, or
 * the last step that changes something failed and nothing has worked since), Claude is still at it,
 * or all good. A step that was cut short or stopped says nothing. `attention` is left out for an
 * older moment, such as a replay.
 */
export function healthOf(steps: readonly Seen[], attention?: Attention): Health {
  if (needsYou(attention)) return 'you'
  if (checksOf(steps) === 'fail') return 'fix'
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (QUIET.has(s.category) || s.status === 'running' || isStopped(s)) continue
    if (s.status === 'failed') return 'fix'
    break
  }
  return attention === 'working' ? 'working' : 'ok'
}
