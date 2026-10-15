import { describe, expect, test } from 'vitest'
import type { FeedStep } from '@sidecar/shared'
import { feedReducer, initialFeed } from '../src/feed'

const step = (id: string, seq: number, startedAt: number, sessionId = 's1'): FeedStep => ({
  id, sessionId, toolName: 'Bash', input: {}, startedAt, status: 'ok', seq,
  category: 'fallback', caption: id, techLabel: 'Bash', scene: { scene: 'thinking', cast: [], beats: [], caption: id },
})
const session = (id: string, lastAt: number) => ({ id, cwd: `/${id}`, startedAt: 0, lastAt })

describe('feedReducer', () => {
  test('a steps snapshot marks that session loaded', () => {
    expect(initialFeed.loaded).toEqual({})
    const s = feedReducer(initialFeed, { type: 'steps', sessionId: 's1', steps: [] })
    expect(s.loaded).toEqual({ s1: true })
  })
  test('first session auto-selects; sessions sorted by lastAt desc', () => {
    let s = feedReducer(initialFeed, { type: 'session', session: session('a', 1) })
    s = feedReducer(s, { type: 'session', session: session('b', 2) })
    expect(s.selected).toBe('a')
    expect(s.sessions.map((x) => x.id)).toEqual(['b', 'a'])
  })
  test('step upserts by id, keeps startedAt order, tracks lastSeq', () => {
    let s = feedReducer(initialFeed, { type: 'step', step: step('x', 1, 20) })
    s = feedReducer(s, { type: 'step', step: step('y', 2, 10) })
    s = feedReducer(s, { type: 'step', step: { ...step('x', 3, 20), status: 'failed' } })
    expect(s.steps.s1!.map((x) => [x.id, x.status])).toEqual([['y', 'ok'], ['x', 'failed']])
    expect(s.lastSeq).toBe(3)
  })
  test('replayed (older) step messages are idempotent', () => {
    let s = feedReducer(initialFeed, { type: 'step', step: { ...step('x', 5, 1), status: 'failed' } })
    s = feedReducer(s, { type: 'step', step: step('x', 2, 1) })
    expect(s.steps.s1![0]!.status).toBe('failed')
    expect(s.lastSeq).toBe(5)
  })
  test('bulk load merges with live steps, keeping the newer copy of each', () => {
    let s = feedReducer(initialFeed, { type: 'step', step: { ...step('a', 9, 1), status: 'failed' } })
    s = feedReducer(s, { type: 'step', step: step('live', 10, 5) })
    s = feedReducer(s, { type: 'steps', sessionId: 's1', steps: [{ ...step('a', 3, 1), status: 'running' }, step('b', 4, 2)] })
    expect(s.steps.s1!.map((x) => [x.id, x.status])).toEqual([['a', 'failed'], ['b', 'ok'], ['live', 'ok']])
    expect(s.lastSeq).toBe(10)
  })
  test('select switches session', () => {
    expect(feedReducer(initialFeed, { type: 'select', id: 'z' }).selected).toBe('z')
  })
})
