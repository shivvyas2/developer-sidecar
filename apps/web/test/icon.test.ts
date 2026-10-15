import { describe, expect, test } from 'vitest'
import type { FeedStep } from '@sidecar/shared'
import { stepIcon } from '../src/icon'

const step = (over: Partial<FeedStep>): FeedStep => ({
  id: 'a', sessionId: 's1', toolName: 'Bash', input: {}, startedAt: 1, status: 'ok', seq: 1,
  category: 'test', caption: 'a', techLabel: 't', scene: { scene: 'thinking', cast: [], beats: [], caption: 'a' }, ...over,
})

describe('stepIcon (final fix 11)', () => {
  test('a failed test run shows a cross; a passing one a tick; other categories keep their icon', () => {
    expect(stepIcon(step({ status: 'failed' }))).toBe('❌')
    expect(stepIcon(step({ status: 'ok' }))).toBe('✅')
    expect(stepIcon(step({ category: 'install', status: 'failed' }))).toBe('🧰')
  })
})
