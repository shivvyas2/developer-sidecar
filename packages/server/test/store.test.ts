import { describe, expect, test } from 'vitest'
import type { DecisionEntry, FeedStep, GlossaryEntry, RecapEntry, SidecarEvent } from '@sidecar/shared'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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
    expect([s.addDecision(d('d2', 2)), s.addDecision(d('d1', 1)), s.addDecision(d('d1', 9))]).toEqual([true, true, false])
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

const openTemp = () => openStore(':memory:')
const stepFor = (sessionId: string, id: string): FeedStep => ({ ...step(id, 1, 1), sessionId })

describe('revision', () => {
  test('changes on each write that changes the steps, not on reads', () => {
    const store = openTemp()
    const r0 = store.revision('S1')
    store.saveStep(stepFor('S1', 'a'))
    const r1 = store.revision('S1')
    expect(r1).not.toBe(r0)
    store.stepsForSession('S1')
    expect(store.revision('S1')).toBe(r1)
    store.saveExplanation('S1', 'a', { unavailable: 'off' }, 1)
    const r2 = store.revision('S1')
    expect(r2).not.toBe(r1)
    store.deleteSession('S1')
    expect(store.revision('S1')).not.toBe(r2)
  })
  test('one session does not move another', () => {
    const store = openTemp()
    const other = store.revision('S2')
    store.saveStep(stepFor('S1', 'a'))
    expect(store.revision('S2')).toBe(other)
  })
  test('deleteAll moves every session', () => {
    const store = openTemp()
    const before = store.revision('S9')
    store.deleteAll()
    expect(store.revision('S9')).not.toBe(before)
  })
  test('revision differs across store instances (a server restart)', () => {
    expect(openTemp().revision('S1')).not.toBe(openTemp().revision('S1'))
  })
})

describe('session attention', () => {
  test('round-trips and is kept by touches that carry none', () => {
    const s = openStore(':memory:')
    s.touchSession('s1', '/a', 10, { state: 'permission', text: 'Claude needs your permission to use Bash' })
    expect(s.touchSession('s1', '/a', 20)).toEqual({
      id: 's1', cwd: '/a', startedAt: 10, lastAt: 20,
      attention: 'permission', attentionAt: 10, attentionText: 'Claude needs your permission to use Bash',
    })
    expect(s.touchSession('s1', '/a', 30, { state: 'working' })).toMatchObject({ attention: 'working', attentionAt: 30 })
    expect(s.getSession('s1')?.attentionText).toBeUndefined()
  })
  test('a database from 0.1.0 gains the attention columns on open', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sidecar-store-')), 'old.db')
    const old = new DatabaseSync(path)
    old.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL)')
    old.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run('s1', '/a', 1, 2)
    old.close()
    const s = openStore(path)
    expect(s.listSessions()).toEqual([{ id: 's1', cwd: '/a', startedAt: 1, lastAt: 2 }])
    expect(s.touchSession('s1', '/a', 3, { state: 'done' }).attention).toBe('done')
    s.close()
    expect(() => openStore(path).close()).not.toThrow()
  })
})

describe('recaps', () => {
  const recap = (turnId: string, status: RecapEntry['status'], at = 1, sessionId = 's1'): RecapEntry =>
    ({ sessionId, turnId, lastStepId: `${turnId}-last`, at, status, ...(status === 'done' ? { ai: { summary: 'S', meaning: 'M' } } : {}) })

  test('a turn has one recap that is replaced; only a call (pending) is counted', () => {
    const s = openStore(':memory:')
    expect(s.saveRecap(recap('p1', 'pending'))).toBe(1)
    expect(s.saveRecap(recap('p1', 'done', 2))).toBe(1)
    expect(s.getRecap('p1')).toMatchObject({ status: 'done', ai: { summary: 'S' }, count: 1 })
    expect(s.saveRecap(recap('p1', 'pending', 3))).toBe(2)
    expect(s.saveRecap(recap('p2', 'unavailable', 4))).toBe(0)
    expect(s.getRecap('nope')).toBeUndefined()
  })

  test('a call on a turn already recapped is counted without touching its recap', () => {
    const s = openStore(':memory:')
    s.saveRecap(recap('p1', 'pending'))
    s.saveRecap(recap('p1', 'done', 2))
    expect(s.countRecapCall('p1')).toBe(2)
    expect(s.getRecap('p1')).toMatchObject({ status: 'done', ai: { summary: 'S' }, at: 2, count: 2 })
    expect(s.countRecapCall('nope')).toBe(0)
  })

  test('pending recaps can all be failed at once, keeping their count', () => {
    const s = openStore(':memory:')
    s.saveRecap(recap('p1', 'pending'))
    s.saveRecap(recap('p2', 'done'))
    s.saveRecap(recap('p3', 'pending', 1, 's2'))
    const failed = s.failPendingRecaps('restarted', 9)
    expect(failed.map((r) => r.turnId).sort()).toEqual(['p1', 'p3'])
    expect(failed[0]).toMatchObject({ status: 'unavailable', reason: 'restarted', at: 9 })
    expect(s.getRecap('p1')).toMatchObject({ status: 'unavailable', reason: 'restarted', lastStepId: 'p1-last', count: 1 })
    expect(s.getRecap('p2')!.status).toBe('done')
    expect(s.failPendingRecaps('again', 10)).toEqual([])
  })

  test('the newest recap of each session that was never called', () => {
    const s = openStore(':memory:')
    s.saveRecap(recap('a1', 'unavailable', 1))
    s.saveRecap(recap('a2', 'unavailable', 2))
    s.saveRecap(recap('b1', 'unavailable', 1, 's2'))
    s.saveRecap(recap('b2', 'done', 2, 's2'))
    s.saveRecap(recap('c1', 'pending', 1, 's3'))
    s.saveRecap(recap('c1', 'unavailable', 2, 's3'))
    // s1's newest was never called; s2's newest is done; s3's newest was called once
    expect(s.unavailableRecaps().map((r) => r.turnId)).toEqual(['a2'])
  })

  test('listed per session, oldest first, and deleted with the session', () => {
    const s = openStore(':memory:')
    s.saveRecap(recap('b', 'done', 5))
    s.saveRecap(recap('a', 'unavailable', 2))
    s.saveRecap(recap('x', 'done', 1, 's2'))
    expect(s.listRecaps('s1').map((r) => r.turnId)).toEqual(['a', 'b'])
    s.deleteSession('s1')
    expect(s.listRecaps('s1')).toEqual([])
    expect(s.listRecaps('s2')).toHaveLength(1)
    s.deleteAll()
    expect(s.listRecaps('s2')).toEqual([])
  })

  test('a database from before recaps gains the table on open', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sidecar-store-')), 'old.db')
    const old = new DatabaseSync(path)
    old.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL)')
    old.close()
    const s = openStore(path)
    expect(s.saveRecap(recap('p1', 'pending'))).toBe(1)
    s.close()
  })
})

describe('baselines', () => {
  const b = { files: ['app/page.tsx'], packages: ['next'], folders: [], truncated: false, scannedAt: 5,
    git: { repo: true, remote: null, ignoresSecrets: true, ignoresDeps: true, ignoresBuild: false, readme: false } }
  test('a saved scan comes back for its session only', () => {
    const s = openStore(':memory:')
    s.saveBaseline('s1', b)
    expect(s.getBaseline('s1')).toEqual(b)
    expect(s.getBaseline('s2')).toBeUndefined()
  })
  test('deleting a session deletes its scan', () => {
    const s = openStore(':memory:')
    s.touchSession('s1', '/p', 1)
    s.saveBaseline('s1', b)
    s.deleteSession('s1')
    expect(s.getBaseline('s1')).toBeUndefined()
  })
})
