import { describe, expect, test } from 'vitest'
import type { ServerMessage, SidecarEvent } from '@sidecar/shared'
import { Hub } from '../src/hub'
import { createPipeline } from '../src/pipeline'
import { openStore } from '../src/store'

const ev = (id: string, kind: SidecarEvent['kind'], over: Partial<SidecarEvent> = {}): SidecarEvent =>
  ({ id, sessionId: 's1', ts: 1000, cwd: '/p', kind, ...over })

function setup(now = () => 1000) {
  const store = openStore(':memory:')
  const hub = new Hub()
  const got: ServerMessage[] = []
  hub.subscribe((m) => got.push(m))
  return { store, hub, got, p: createPipeline({ store, hub, now }) }
}

describe('pipeline', () => {
  test('tool start + end → session message + two step updates, persisted', () => {
    const { store, got, p } = setup()
    p.ingest(ev('a', 'tool_start', { tool: { name: 'Bash', useId: 'u', input: { command: 'npm install stripe' } } }))
    p.ingest(ev('b', 'tool_end', { ts: 1500, tool: { name: 'Bash', useId: 'u', input: { command: 'npm install stripe' }, ok: true } }))
    expect(got.filter((m) => m.type === 'session')).toHaveLength(2)
    const steps = got.flatMap((m) => (m.type === 'step' ? [m.step] : []))
    expect(steps.map((s) => [s.status, s.seq, s.category])).toEqual([['running', 1, 'install'], ['ok', 2, 'install']])
    expect(store.stepsForSession('s1')).toHaveLength(1)
    expect(store.stepsForSession('s1')[0]?.endedAt).toBe(1500)
  })
  test('duplicate event id is ignored', () => {
    const { got, p } = setup()
    p.ingest(ev('a', 'prompt', { prompt: 'hi' }))
    expect(p.ingest(ev('a', 'prompt', { prompt: 'hi' }))).toEqual({ seq: null })
    expect(got.filter((m) => m.type === 'step')).toHaveLength(1)
  })
  test('secrets are re-scrubbed on the server', () => {
    const { store, p } = setup()
    p.ingest(ev('a', 'tool_start', { tool: { name: 'Bash', useId: 'u', input: { command: 'export K=ghp_abcdefghijklmnopqrstuvwxyz0123' } } }))
    expect(JSON.stringify(store.stepsForSession('s1'))).not.toContain('ghp_abc')
  })
  test('sweep marks stale running steps interrupted with a new seq', () => {
    let t = 0
    const { store, got, p } = setup(() => t)
    p.ingest(ev('a', 'tool_start', { ts: 0, tool: { name: 'Bash', useId: 'u', input: { command: 'sleep 9999' } } }))
    t = 700_000
    expect(p.sweep()).toBe(1)
    const last = got.at(-1)
    expect(last?.type === 'step' && last.step.status).toBe('interrupted')
    expect(store.stepsAfter(1).map((s) => s.status)).toEqual(['interrupted'])
  })
  test('lastActivity tracks ingest time', () => {
    let t = 5
    const { p } = setup(() => t)
    t = 42
    p.ingest(ev('a', 'turn_end'))
    expect(p.lastActivity()).toBe(42)
  })
})
