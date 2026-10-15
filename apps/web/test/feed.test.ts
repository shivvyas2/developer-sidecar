import { describe, expect, test, vi } from 'vitest'
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

describe('explainer state', () => {
  const exp = { plain: 'p', why: 'w', concept: null, decision: null }
  test('explanations come from messages and from step snapshots', () => {
    let s = feedReducer(initialFeed, { type: 'explanation', sessionId: 's1', stepId: 'x', explanation: exp })
    expect(s.explanations.x).toEqual(exp)
    s = feedReducer(s, { type: 'steps', sessionId: 's1', steps: [{ ...step('y', 1, 1), explanation: { unavailable: 'r' } }] })
    expect(s.explanations.y).toEqual({ unavailable: 'r' })
  })
  test('decisions dedupe by id in time order; glossary dedupes terms case-insensitively, sorted', () => {
    const d = (id: string, at: number) => ({ id, sessionId: 's1', stepId: 'a', at, title: id, choice: 'c', alternatives: [], reason: 'r' })
    let s = feedReducer(initialFeed, { type: 'decision', decision: d('b', 2) })
    s = feedReducer(s, { type: 'decision', decision: d('a', 1) })
    s = feedReducer(s, { type: 'decision', decision: d('a', 1) })
    expect(s.decisions.s1!.map((x) => x.id)).toEqual(['a', 'b'])
    const c = (term: string) => ({ term, definition: 'd', sessionId: 's1', stepId: 'a', at: 1 })
    s = feedReducer(s, { type: 'concept', concept: c('SDK') })
    s = feedReducer(s, { type: 'concept', concept: c('api') })
    s = feedReducer(s, { type: 'concept', concept: c('sdk') })
    expect(s.glossary.s1!.map((x) => x.term)).toEqual(['api', 'SDK'])
    s = feedReducer(s, { type: 'glossary', sessionId: 's1', entries: [c('Zeta')] })
    expect(s.glossary.s1!.map((x) => x.term)).toEqual(['api', 'SDK', 'Zeta'])
  })
  test('a decisions snapshot merges with live decisions by id (snapshot wins), in time order (final fix 5)', () => {
    const d = (id: string, at: number, title = id) => ({ id, sessionId: 's1', stepId: 'a', at, title, choice: 'c', alternatives: [], reason: 'r' })
    let s = feedReducer(initialFeed, { type: 'decision', decision: d('live', 5) })
    s = feedReducer(s, { type: 'decision', decision: d('both', 3, 'old') })
    s = feedReducer(s, { type: 'decisions', sessionId: 's1', decisions: [d('both', 3, 'new'), d('first', 1)] })
    expect(s.decisions.s1!.map((x) => [x.id, x.title])).toEqual([['first', 'first'], ['both', 'new'], ['live', 'live']])
  })
  test('a glossary snapshot merges with live terms case-insensitively; the existing entry wins (final fix 5)', () => {
    const c = (term: string, definition = 'd') => ({ term, definition, sessionId: 's1', stepId: 'a', at: 1 })
    let s = feedReducer(initialFeed, { type: 'concept', concept: c('Webhook', 'live') })
    s = feedReducer(s, { type: 'glossary', sessionId: 's1', entries: [c(' webhook ', 'snapshot'), c('API')] })
    expect(s.glossary.s1!.map((x) => [x.term, x.definition])).toEqual([['API', 'd'], ['Webhook', 'live']])
  })
  test('session_deleted also prunes that session\'s explanations (final fix 9)', () => {
    let s = feedReducer(initialFeed, { type: 'step', step: step('x', 1, 1, 'b') })
    s = feedReducer(s, { type: 'step', step: step('y', 2, 2, 'a') })
    s = feedReducer(s, { type: 'explanation', sessionId: 'b', stepId: 'x', explanation: { unavailable: 'r' } })
    s = feedReducer(s, { type: 'explanation', sessionId: 'a', stepId: 'y', explanation: { unavailable: 'r' } })
    s = feedReducer(s, { type: 'session_deleted', id: 'b' })
    expect(Object.keys(s.explanations)).toEqual(['y'])
  })
  test('readySince is set when the explainer becomes ready and kept while it stays ready (final fix 3)', () => {
    vi.useFakeTimers()
    try {
      const st = (status: 'ready' | 'paused') => ({ level: 'haiku' as const, provider: 'api' as const, status, tokens: { input: 0, output: 0 } })
      vi.setSystemTime(1000)
      let s = feedReducer(initialFeed, { type: 'explainer', state: st('ready') })
      expect(s.readySince).toBe(1000)
      vi.setSystemTime(2000)
      s = feedReducer(s, { type: 'explainer', state: st('ready') })
      expect(s.readySince).toBe(1000)
      s = feedReducer(s, { type: 'explainer', state: st('paused') })
      vi.setSystemTime(3000)
      s = feedReducer(s, { type: 'explainer', state: st('ready') })
      expect(s.readySince).toBe(3000)
    } finally {
      vi.useRealTimers()
    }
  })
  test('session_deleted removes the session and reselects; reset clears all but explainer state', () => {
    let s = feedReducer(initialFeed, { type: 'sessions', sessions: [session('a', 1), session('b', 2)] })
    s = feedReducer(s, { type: 'select', id: 'b' })
    s = feedReducer(s, { type: 'step', step: step('x', 1, 1, 'b') })
    s = feedReducer(s, { type: 'explainer', state: { level: 'haiku', provider: 'api', status: 'ready', tokens: { input: 1, output: 1 } } })
    s = feedReducer(s, { type: 'session_deleted', id: 'b' })
    expect(s.sessions.map((x) => x.id)).toEqual(['a'])
    expect(s.selected).toBe('a')
    expect(s.steps.b).toBeUndefined()
    s = feedReducer(s, { type: 'reset' })
    expect(s.sessions).toEqual([])
    expect(s.selected).toBeNull()
    expect(s.lastSeq).toBe(0)
    expect(s.explainer?.status).toBe('ready')
  })
})
