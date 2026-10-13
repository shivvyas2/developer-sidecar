import { fromHookPayload, scrubEvent } from '@sidecar/shared'
import { logLine, readPort, readToken } from '@sidecar/shared/home'
import { loadEnvSecrets } from './env-secrets'

export interface EmitDeps {
  stdin: string
  env: Record<string, string | undefined>
  home: string
  now: number
  id: string
  fetch: typeof fetch
  timeoutMs?: number
}

export async function runEmit(d: EmitDeps): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    if (d.env.SIDECAR_INTERNAL === '1' || d.env.CLAUDE_CODE_REMOTE === 'true') return 'skipped'
    const token = readToken(d.home)
    if (!token) return 'skipped'
    const event = fromHookPayload(JSON.parse(d.stdin), { now: d.now, id: d.id })
    if (!event) return 'skipped'
    const body = JSON.stringify(scrubEvent(event, loadEnvSecrets(event.cwd)))
    const res = await d.fetch(`http://127.0.0.1:${readPort(d.home)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sidecar-token': token },
      body,
      signal: AbortSignal.timeout(d.timeoutMs ?? 300),
    })
    if (!res.ok) logLine(d.home, 'emit.log', `server answered ${res.status}`)
    return res.ok ? 'sent' : 'failed'
  } catch (err) {
    logLine(d.home, 'emit.log', `emit failed: ${(err as Error).message}`)
    return 'failed'
  }
}
