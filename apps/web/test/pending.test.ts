import { describe, expect, test } from 'vitest'
import type { ExplainerState, FeedStep } from '@sidecar/shared'
import { isPendingExplanation } from '../src/pending'

const step = (over: Partial<FeedStep> = {}): FeedStep => ({
  id: 'a', sessionId: 's1', toolName: 'Bash', input: {}, startedAt: 100, endedAt: 200, status: 'ok', seq: 1,
  category: 'install', caption: 'a', techLabel: 'npm i', scene: { scene: 'thinking', cast: [], beats: [], caption: 'a' }, ...over,
})
const ex = (status: ExplainerState['status']): ExplainerState => ({ level: 'haiku', provider: 'api', status, tokens: { input: 0, output: 0 } })

describe('isPendingExplanation (final fix 3)', () => {
  test('a finished step that ended after the explainer became ready is pending', () => {
    expect(isPendingExplanation(step(), undefined, ex('ready'), 150)).toBe(true)
    expect(isPendingExplanation(step({ status: 'failed' }), undefined, ex('ready'), 200)).toBe(true)
  })
  test('not pending: explainer not ready, step running/interrupted, prompt, already explained, or ended before ready', () => {
    for (const status of ['off', 'paused', 'unavailable'] as const) expect(isPendingExplanation(step(), undefined, ex(status), 0)).toBe(false)
    expect(isPendingExplanation(step(), undefined, null, 0)).toBe(false)
    expect(isPendingExplanation(step({ status: 'running', endedAt: undefined }), undefined, ex('ready'), 0)).toBe(false)
    expect(isPendingExplanation(step({ status: 'interrupted' }), undefined, ex('ready'), 0)).toBe(false)
    expect(isPendingExplanation(step({ category: 'prompt' }), undefined, ex('ready'), 0)).toBe(false)
    expect(isPendingExplanation(step(), { unavailable: 'x' }, ex('ready'), 0)).toBe(false)
    expect(isPendingExplanation(step(), undefined, ex('ready'), 201)).toBe(false)
    expect(isPendingExplanation(step({ endedAt: undefined }), undefined, ex('ready'), 0)).toBe(false)
  })
})
