import { SIDECAR_NAME } from '@sidecar/shared'
import { ownPort, readPort } from '@sidecar/shared/home'

export interface StartDeps {
  home: string
  serverPath: string
  fetch: typeof fetch
  spawnServer: (serverPath: string) => void
  sleep: (ms: number) => Promise<void>
  attempts?: number
}

export async function isSidecarUp(home: string, f: typeof fetch): Promise<number | null> {
  // no port file: this home has no server yet, so never probe the default port
  const port = ownPort(home)
  if (port === null) return null
  try {
    const res = await f(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(300) })
    const body = (await res.json()) as { name?: string }
    return body.name === SIDECAR_NAME ? port : null
  } catch {
    return null
  }
}

export async function ensureServer(d: StartDeps): Promise<{ ok: boolean; port: number; started: boolean }> {
  const up = await isSidecarUp(d.home, d.fetch)
  if (up !== null) return { ok: true, port: up, started: false }
  d.spawnServer(d.serverPath)
  for (let i = 0; i < (d.attempts ?? 30); i++) {
    await d.sleep(100)
    const port = await isSidecarUp(d.home, d.fetch)
    if (port !== null) return { ok: true, port, started: true }
  }
  return { ok: false, port: readPort(d.home), started: true }
}
