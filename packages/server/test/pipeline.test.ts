import { describe, expect, test } from 'vitest'
import type { ServerMessage, SidecarEvent } from '@sidecar/shared'
import { Hub } from '../src/hub'
import { attentionOf, createPipeline } from '../src/pipeline'
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

describe('closing open steps', () => {
  test('turn_end is announced once, after the open steps are closed and stored', () => {
    const { store, hub, got, p } = setup()
    let seenSteps: string[] = []
    hub.subscribe((m) => { if (m.type === 'turn_end') seenSteps = store.stepsForSession('s1').map((s) => s.status) })
    p.ingest(ev('a', 'tool_start', { tool: { name: 'Bash', useId: 'u', input: { command: 'npm run dev' } } }))
    p.ingest(ev('b', 'turn_end', { ts: 1200 }))
    const types = got.map((m) => m.type)
    expect(types.filter((t) => t === 'turn_end')).toHaveLength(1)
    expect(types.lastIndexOf('step')).toBeLessThan(types.indexOf('turn_end'))
    expect(got.find((m) => m.type === 'turn_end')).toEqual({ type: 'turn_end', sessionId: 's1', at: 1200, lastStepId: 'u' })
    expect(seenSteps).toEqual(['interrupted'])
    // a repeated Stop event (same id) is not announced again
    p.ingest(ev('b', 'turn_end', { ts: 1200 }))
    expect(got.filter((m) => m.type === 'turn_end')).toHaveLength(1)
  })
  test('turn_end names the turn’s newest step, even when the next prompt was stored before the Stop', () => {
    const { got, p } = setup()
    p.ingest(ev('a', 'prompt', { prompt: 'Add checkout', ts: 900 }))
    p.ingest(ev('b', 'tool_end', { ts: 1000, tool: { name: 'Write', useId: 'w', input: { file_path: '/p/a.ts', content: 'x' }, ok: true } }))
    // a message you queued, sent the moment the turn ended, reaches Sidecar first
    p.ingest(ev('c', 'prompt', { prompt: 'Now add emails', ts: 1300 }))
    p.ingest(ev('d', 'turn_end', { ts: 1200 }))
    expect(got.find((m) => m.type === 'turn_end')).toEqual({ type: 'turn_end', sessionId: 's1', at: 1200, lastStepId: 'w' })
    // a Stop with no step before it names none
    const empty = setup()
    empty.p.ingest(ev('a', 'turn_end'))
    expect(empty.got.find((m) => m.type === 'turn_end')).toEqual({ type: 'turn_end', sessionId: 's1', at: 1000 })
  })
  test('other events never announce a turn end', () => {
    const { got, p } = setup()
    p.ingest(ev('a', 'prompt', { prompt: 'hi' }))
    p.ingest(ev('b', 'subagent_end'))
    p.ingest(ev('c', 'notice', { raw: { message: 'Claude needs your permission', notification_type: 'permission_prompt' } }))
    expect(got.some((m) => m.type === 'turn_end')).toBe(false)
  })
  test('turn_end closes the session’s running steps as interrupted', () => {
    const { store, p } = setup()
    p.ingest(ev('a', 'tool_start', { tool: { name: 'Bash', useId: 'denied', input: { command: 'rm -rf build' } } }))
    p.ingest(ev('b', 'turn_end'))
    expect(store.stepsForSession('s1').map((s) => [s.id, s.status])).toEqual([['denied', 'interrupted']])
  })
  test('a new prompt closes leftovers but other sessions are untouched', () => {
    const { store, p } = setup()
    p.ingest(ev('a', 'tool_start', { tool: { name: 'Bash', useId: 'x', input: {} } }))
    p.ingest(ev('b', 'tool_start', { sessionId: 's2', tool: { name: 'Bash', useId: 'y', input: {} } }))
    p.ingest(ev('c', 'prompt', { prompt: 'next' }))
    expect(store.stepsForSession('s1').find((s) => s.id === 'x')?.status).toBe('interrupted')
    expect(store.stepsForSession('s2')[0]?.status).toBe('running')
  })
})

describe('attention', () => {
  const notice = (id: string, raw: unknown, ts = 1000) => ev(id, 'notice', { raw, ts })
  const lastSession = (got: ServerMessage[]) => got.flatMap((m) => (m.type === 'session' ? [m.session] : [])).at(-1)

  test('a permission notice, the next tool call and the end of the turn move the session along', () => {
    const { store, got, p } = setup()
    p.ingest(ev('a', 'prompt', { prompt: 'hi', ts: 900 }))
    expect(lastSession(got)?.attention).toBe('working')
    p.ingest(notice('b', { message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' }, 1000))
    expect(lastSession(got)).toMatchObject({ attention: 'permission', attentionAt: 1000, attentionText: 'Claude needs your permission to use Bash' })
    p.ingest(ev('c', 'tool_end', { ts: 1100, tool: { name: 'Bash', useId: 'u', input: {}, ok: true } }))
    expect(lastSession(got)?.attention).toBe('working')
    expect(lastSession(got)?.attentionText).toBeUndefined()
    p.ingest(ev('d', 'turn_end', { ts: 1200 }))
    expect(store.listSessions()[0]?.attention).toBe('done')
  })
  test('an idle notice asks for the next message', () => {
    const { got, p } = setup()
    p.ingest(notice('a', { message: 'Claude is waiting for your input', notification_type: 'idle_prompt' }))
    expect(lastSession(got)?.attention).toBe('idle')
  })
  test('an older event does not overwrite newer attention', () => {
    const { store, p } = setup()
    p.ingest(ev('a', 'turn_end', { ts: 2000 }))
    p.ingest(ev('b', 'tool_end', { ts: 1500, tool: { name: 'Bash', input: {}, ok: true } }))
    expect(store.listSessions()[0]?.attention).toBe('done')
  })
  test('notices without a type fall back to their wording; other notices change nothing', () => {
    expect(attentionOf(notice('a', { message: 'Claude needs your permission to use Write' }))?.state).toBe('permission')
    expect(attentionOf(notice('b', { message: 'Claude is waiting for your input' }))?.state).toBe('idle')
    expect(attentionOf(notice('c', { message: 'Auth refreshed', notification_type: 'auth_success' }))).toBeUndefined()
    expect(attentionOf(ev('d', 'session_start'))).toBeUndefined()
  })
  test('long notice text is clipped', () => {
    const a = attentionOf(notice('a', { message: 'x'.repeat(500), notification_type: 'permission_prompt' }))
    expect(a?.text).toHaveLength(200)
  })
})
