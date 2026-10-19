import type { EventKind, SidecarEvent } from './events'

export const KIND_BY_HOOK: Record<string, EventKind> = {
  SessionStart: 'session_start',
  UserPromptSubmit: 'prompt',
  PreToolUse: 'tool_start',
  PostToolUse: 'tool_end',
  PostToolUseFailure: 'tool_end',
  SubagentStop: 'subagent_end',
  Notification: 'notice',
  Stop: 'turn_end',
}

/** A plain object (not null, not an array). */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function responseOk(resp: unknown): boolean {
  if (!isRecord(resp)) return true
  return !(resp.is_error === true || resp.isError === true || resp.success === false || resp.interrupted === true)
}

export function fromHookPayload(payload: unknown, opts: { now: number; id: string }): SidecarEvent | null {
  if (!isRecord(payload)) return null
  const sessionId = str(payload.session_id)
  if (!sessionId) return null
  const hook = str(payload.hook_event_name) ?? ''
  const kind = KIND_BY_HOOK[hook] ?? 'notice'
  const event: SidecarEvent = { id: opts.id, sessionId, ts: opts.now, cwd: str(payload.cwd) ?? '', kind }

  if (kind === 'tool_start' || kind === 'tool_end') {
    const useId = str(payload.tool_use_id)
    event.tool = { name: str(payload.tool_name) ?? 'unknown', input: payload.tool_input ?? {} }
    if (useId) event.tool.useId = useId
    if (kind === 'tool_end') {
      if (hook === 'PostToolUseFailure') {
        event.tool.ok = false
        event.tool.output = payload.error ?? payload.tool_response
      } else {
        event.tool.ok = responseOk(payload.tool_response)
        event.tool.output = payload.tool_response
      }
    }
  } else if (kind === 'prompt') {
    event.prompt = str(payload.prompt) ?? ''
  } else if (kind === 'notice') {
    event.raw = KIND_BY_HOOK[hook] ? { message: payload.message } : payload
  }
  return event
}
