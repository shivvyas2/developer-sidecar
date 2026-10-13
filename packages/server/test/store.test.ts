import { describe, expect, test } from 'vitest'
import type { FeedStep, SidecarEvent } from '@sidecar/shared'
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
