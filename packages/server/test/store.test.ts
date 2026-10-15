import { describe, expect, test } from 'vitest'
import type { DecisionEntry, FeedStep, GlossaryEntry, SidecarEvent } from '@sidecar/shared'
import { openStore } from '../src/store'

const ev = (id: string, over: Partial<SidecarEvent> = {}): SidecarEvent =>
  ({ id, sessionId: 's1', ts: 1, cwd: '/p', kind: 'tool_start', ...over })

const step = (id: string, seq: number, startedAt: number): FeedStep => ({
  id, sessionId: 's1', toolName: 'Bash', input: {}, startedAt, status: 'ok', seq,
  category: 'fallback', caption: 'c', techLabel: 't',
  scene: { scene: 'thinking', cast: ['claude'], beats: [], caption: 'c' },
})

describe('store', () => {
  test('insertEvent returns increasing seq and ignores duplicate ids', () => {
    const s = openStore(':memory:')
    expect(s.insertEvent(ev('a'))).toBe(1)
    expect(s.insertEvent(ev('b'))).toBe(2)
    expect(s.insertEvent(ev('a'))).toBeNull()
  })
  test('sessions upsert and order by lastAt desc', () => {
    const s = openStore(':memory:')
    s.touchSession('s1', '/a', 10)
    s.touchSession('s2', '/b', 20)
    const updated = s.touchSession('s1', '/a', 30)
    expect(updated).toEqual({ id: 's1', cwd: '/a', startedAt: 10, lastAt: 30 })
    expect(s.listSessions().map((x) => x.id)).toEqual(['s1', 's2'])
  })
  test('steps upsert by id; query by session and by seq', () => {
    const s = openStore(':memory:')
    s.saveStep(step('x', 1, 100))
    s.saveStep(step('y', 2, 50))
    s.saveStep({ ...step('x', 3, 100), status: 'failed' })
    expect(s.stepsForSession('s1').map((x) => x.id)).toEqual(['y', 'x'])
    expect(s.stepsForSession('s1')[1]?.status).toBe('failed')
    expect(s.stepsAfter(1).map((x) => [x.id, x.seq])).toEqual([['y', 2], ['x', 3]])
    expect(s.stepsAfter(3)).toEqual([])
  })
})

describe('explainer data', () => {
  const fs = (id: string, sessionId = 's1', over: Partial<FeedStep> = {}): FeedStep => ({
    id, sessionId, toolName: 'Bash', input: {}, startedAt: 1, status: 'ok', seq: 1,
    category: 'fallback', caption: id, techLabel: 'Bash', scene: { scene: 'thinking', cast: [], beats: [], caption: id }, ...over,
  })
  const exp = { plain: 'p', why: 'w', concept: null, decision: null }

  test('explanations merge into steps from both queries, and can be replaced', () => {
    const s = openStore(':memory:')
    s.saveStep(fs('a'))
    expect(s.hasExplanation('a')).toBe(false)
    s.saveExplanation('s1', 'a', { unavailable: 'x' }, 5)
    s.saveExplanation('s1', 'a', exp, 6)
    expect(s.hasExplanation('a')).toBe(true)
    expect(s.stepsForSession('s1')[0]!.explanation).toEqual(exp)
    expect(s.stepsAfter(0)[0]!.explanation).toEqual(exp)
    s.saveStep({ ...fs('a'), seq: 2, status: 'failed' }) // a later step update keeps the explanation
    expect(s.stepsForSession('s1')[0]!.explanation).toEqual(exp)
  })

  test('decisions list oldest first and ignore duplicate ids', () => {
    const s = openStore(':memory:')
    const d = (id: string, at: number): DecisionEntry => ({ id, sessionId: 's1', stepId: 'a', at, title: id, choice: 'c', alternatives: [], reason: 'r' })
    s.addDecision(d('d2', 2)); s.addDecision(d('d1', 1)); s.addDecision(d('d1', 9))
    expect(s.listDecisions('s1').map((x) => [x.id, x.at])).toEqual([['d1', 1], ['d2', 2]])
    expect(s.listDecisions('other')).toEqual([])
  })

  test('glossary is per session, case-insensitive, first definition wins, sorted', () => {
    const s = openStore(':memory:')
    const c = (term: string, definition: string, sessionId = 's1'): GlossaryEntry => ({ term, definition, sessionId, stepId: 'a', at: 1 })
    expect(s.addConcept(c('SDK', 'first'))).toBe(true)
    expect(s.addConcept(c('sdk ', 'second'))).toBe(false)
    expect(s.addConcept(c('API', 'x'))).toBe(true)
    expect(s.addConcept(c('SDK', 'other session', 's2'))).toBe(true)
    expect(s.listGlossary('s1').map((x) => [x.term, x.definition])).toEqual([['API', 'x'], ['SDK', 'first']])
  })

  test('usage accumulates and persists in meta', () => {
    const s = openStore(':memory:')
    expect(s.usage()).toEqual({ input: 0, output: 0 })
    s.addUsage({ input: 10, output: 2 })
    expect(s.addUsage({ input: 5, output: 1 })).toEqual({ input: 15, output: 3 })
    expect(s.usage()).toEqual({ input: 15, output: 3 })
  })

  test('lastPrompt returns the newest prompt text; getSession finds sessions', () => {
    const s = openStore(':memory:')
    s.touchSession('s1', '/p/app', 1)
    s.saveStep(fs('p1', 's1', { category: 'prompt', toolName: 'UserPrompt', input: { prompt: 'first' }, startedAt: 1 }))
    s.saveStep(fs('p2', 's1', { category: 'prompt', toolName: 'UserPrompt', input: { prompt: 'second' }, startedAt: 2 }))
    s.saveStep(fs('x', 's1', { startedAt: 3 }))
    expect(s.lastPrompt('s1')).toBe('second')
    expect(s.lastPrompt('nope')).toBeUndefined()
    expect(s.getSession('s1')?.cwd).toBe('/p/app')
    expect(s.getSession('nope')).toBeUndefined()
  })

  test('deleteSession removes only that session; deleteAll removes everything but usage', () => {
    const s = openStore(':memory:')
    for (const sid of ['s1', 's2']) {
      s.insertEvent({ id: `e-${sid}`, sessionId: sid, ts: 1, cwd: '/p', kind: 'prompt', prompt: 'hi' })
      s.touchSession(sid, '/p', 1)
      s.saveStep(fs(`st-${sid}`, sid))
      s.saveExplanation(sid, `st-${sid}`, exp, 1)
      s.addDecision({ id: `d-${sid}`, sessionId: sid, stepId: 'x', at: 1, title: 't', choice: 'c', alternatives: [], reason: 'r' })
      s.addConcept({ term: 'SDK', definition: 'd', sessionId: sid, stepId: 'x', at: 1 })
    }
    s.addUsage({ input: 1, output: 1 })
    s.deleteSession('s1')
    expect(s.listSessions().map((x) => x.id)).toEqual(['s2'])
    expect(s.stepsForSession('s1')).toEqual([])
    expect(s.listDecisions('s1')).toEqual([])
    expect(s.listGlossary('s1')).toEqual([])
    expect(s.hasExplanation('st-s1')).toBe(false)
    expect(s.stepsForSession('s2')).toHaveLength(1)
    // a deleted session's events can be ingested again
    expect(s.insertEvent({ id: 'e-s1', sessionId: 's1', ts: 1, cwd: '/p', kind: 'prompt', prompt: 'hi' })).not.toBeNull()
    s.deleteAll()
    expect(s.listSessions()).toEqual([])
    expect(s.stepsAfter(0)).toEqual([])
    expect(s.usage()).toEqual({ input: 1, output: 1 })
  })
})
