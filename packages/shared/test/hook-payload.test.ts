import { describe, expect, test } from 'vitest'
import { fromHookPayload } from '@sidecar/shared'

const base = { session_id: 's1', cwd: '/proj', transcript_path: '/t.jsonl' }
const opts = { now: 1000, id: 'e1' }

describe('fromHookPayload', () => {
  test('PreToolUse → tool_start', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 'tu1' }, opts)
    expect(e).toEqual({ id: 'e1', sessionId: 's1', ts: 1000, cwd: '/proj', kind: 'tool_start', tool: { name: 'Bash', useId: 'tu1', input: { command: 'ls' } } })
  })
  test('PostToolUse → tool_end ok', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {}, tool_response: { content: 'x' } }, opts)
    expect(e?.kind).toBe('tool_end')
    expect(e?.tool?.ok).toBe(true)
    expect(e?.tool?.useId).toBeUndefined()
  })
  test('PostToolUse with is_error → ok false', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {}, tool_response: { is_error: true } }, opts)
    expect(e?.tool?.ok).toBe(false)
  })
  test('PostToolUseFailure → tool_end not ok, output = error', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: {}, error: 'boom' }, opts)
    expect(e?.kind).toBe('tool_end')
    expect(e?.tool).toMatchObject({ ok: false, output: 'boom' })
  })
  test('string tool_response is kept and counts as ok', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {}, tool_response: 'done' }, opts)
    expect(e?.tool).toMatchObject({ ok: true, output: 'done' })
  })
  test('UserPromptSubmit → prompt', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'build a todo app' }, opts)
    expect(e).toMatchObject({ kind: 'prompt', prompt: 'build a todo app' })
  })
  test.each([
    ['SessionStart', 'session_start'], ['SubagentStop', 'subagent_end'],
    ['Notification', 'notice'], ['Stop', 'turn_end'],
  ])('%s → %s', (hook, kind) => {
    expect(fromHookPayload({ ...base, hook_event_name: hook }, opts)?.kind).toBe(kind)
  })
  test('Notification keeps its message and notification type', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt', title: 'x' }, opts)
    expect(e?.raw).toEqual({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  })
  test('unknown hook name → notice with raw payload', () => {
    const e = fromHookPayload({ ...base, hook_event_name: 'FutureHook', foo: 1 }, opts)
    expect(e?.kind).toBe('notice')
    expect(e?.raw).toMatchObject({ hook_event_name: 'FutureHook', foo: 1 })
  })
  test('missing session_id → null', () => {
    expect(fromHookPayload({ hook_event_name: 'Stop' }, opts)).toBeNull()
  })
  test('non-object → null', () => {
    expect(fromHookPayload('nope', opts)).toBeNull()
  })
  test('missing cwd → empty string', () => {
    expect(fromHookPayload({ session_id: 's1', hook_event_name: 'Stop' }, opts)?.cwd).toBe('')
  })
})
