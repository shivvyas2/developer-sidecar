import { describe, expect, test } from 'vitest'
import type { SidecarEvent } from '@sidecar/shared'
import { StepTracker } from '../src/steps'

let n = 0
const ev = (kind: SidecarEvent['kind'], ts: number, tool?: SidecarEvent['tool'], extra: Partial<SidecarEvent> = {}): SidecarEvent =>
  ({ id: `e${++n}`, sessionId: 's1', ts, cwd: '/p', kind, ...(tool ? { tool } : {}), ...extra })

describe('StepTracker', () => {
  test('pairs by useId', () => {
    const t = new StepTracker()
    const a = t.apply(ev('tool_start', 10, { name: 'Bash', useId: 'u1', input: { command: 'ls' } }))
    expect(a).toMatchObject({ id: 'u1', status: 'running', startedAt: 10, toolName: 'Bash' })
    const b = t.apply(ev('tool_end', 15, { name: 'Bash', useId: 'u1', input: { command: 'ls' }, output: 'x', ok: true }))
    expect(b).toMatchObject({ id: 'u1', status: 'ok', startedAt: 10, endedAt: 15, output: 'x' })
  })
  test('pairs FIFO per tool when useId missing', () => {
    const t = new StepTracker()
    const s1 = t.apply(ev('tool_start', 1, { name: 'Read', input: { file_path: 'a' } }))!
    const s2 = t.apply(ev('tool_start', 2, { name: 'Read', input: { file_path: 'b' } }))!
    expect(t.apply(ev('tool_end', 3, { name: 'Read', input: {}, ok: true }))!.id).toBe(s1.id)
    expect(t.apply(ev('tool_end', 4, { name: 'Read', input: {}, ok: false }))).toMatchObject({ id: s2.id, status: 'failed' })
  })
  test('unmatched end becomes a completed step', () => {
    const t = new StepTracker()
    const s = t.apply(ev('tool_end', 9, { name: 'Edit', useId: 'zz', input: { file_path: 'f' }, ok: true }))
    expect(s).toMatchObject({ id: 'zz', status: 'ok', startedAt: 9, endedAt: 9 })
  })
  test('prompt becomes a UserPrompt step', () => {
    const t = new StepTracker()
    const e = ev('prompt', 5, undefined, { prompt: 'hi' })
    expect(t.apply(e)).toMatchObject({ id: e.id, toolName: 'UserPrompt', input: { prompt: 'hi' }, status: 'ok', endedAt: 5 })
  })
  test('other kinds are ignored', () => {
    expect(new StepTracker().apply(ev('turn_end', 1))).toBeNull()
  })
  test('sweep marks old running steps interrupted, once', () => {
    const t = new StepTracker()
    t.apply(ev('tool_start', 0, { name: 'Bash', useId: 'old', input: {} }))
    t.apply(ev('tool_start', 590_000, { name: 'Bash', useId: 'new', input: {} }))
    const swept = t.sweep(600_001)
    expect(swept.map((s) => [s.id, s.status])).toEqual([['old', 'interrupted']])
    expect(t.sweep(600_002)).toEqual([])
  })
})
