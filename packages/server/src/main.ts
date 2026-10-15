import type { Server } from 'node:http'
import { join } from 'node:path'
import { createAdaptorServer } from '@hono/node-server'
import { SIDECAR_NAME } from '@sidecar/shared'
import {
  DEFAULT_PORT, acquireLock, ensureHome, ensureToken, forceLock, logLine, ownPort, releaseLock, writePort,
} from '@sidecar/shared/home'
import { createApp } from './app'
import type { Provider } from './explainer/providers'
import { claudeAvailable, pickProvider } from './explainer/providers'
import { createExplainer } from './explainer/service'
import { Hub } from './hub'
import { createPipeline } from './pipeline'
import { fileSettings } from './settings'
import { openStore } from './store'
import { attachWs } from './ws'

export interface RunningServer {
  port: number
  token: string
  close(): Promise<void>
}

export interface StartOptions {
  home: string
  preferredPort?: number
  staticDir?: string
  idleMs?: number
  sweepMs?: number
  version?: string
  /** How long to wait for a lock holder to answer /health before treating the lock as stale. */
  lockWaitMs?: number
  /** Explanation provider. Omit to auto-detect (API key, then the claude CLI); pass null to disable (tests). */
  provider?: Provider | null
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening)
      if (err.code === 'EADDRINUSE') resolve(false)
      else reject(err)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Whether this home's own server answers /health. A home with no port file has no
 * server yet, so it never falls back to the default port: that could be another
 * home's sidecar.
 */
export async function sidecarAnswers(home: string): Promise<boolean> {
  const port = ownPort(home)
  if (port === null) return false
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(300) })
    return ((await res.json()) as { name?: string }).name === SIDECAR_NAME
  } catch {
    return false
  }
}

/** Takes the lock, or throws 'already running' when a live sidecar holds it. */
async function takeLock(home: string, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs
  while (!acquireLock(home)) {
    if (await sidecarAnswers(home)) throw new Error('already running')
    if (Date.now() >= deadline) {
      // the holder is alive but never answered: a recycled pid or a hung process
      forceLock(home)
      return
    }
    await new Promise((r) => setTimeout(r, 100))
  }
}

export async function startServer(o: StartOptions): Promise<RunningServer> {
  ensureHome(o.home)
  await takeLock(o.home, o.lockWaitMs ?? 3000)

  let store: ReturnType<typeof openStore>
  let token: string
  try {
    token = ensureToken(o.home)
    store = openStore(join(o.home, 'sidecar.db'))
  } catch (err) {
    releaseLock(o.home)
    throw err
  }
  const hub = new Hub()
  const given = 'provider' in o
  const envOff = !given && process.env.SIDECAR_EXPLAINER === 'off'
  let settings: ReturnType<typeof fileSettings>
  let explainer: ReturnType<typeof createExplainer>
  let pipeline: ReturnType<typeof createPipeline>
  let app: ReturnType<typeof createApp>
  let server: Server
  let port = o.preferredPort ?? DEFAULT_PORT
  try {
    settings = fileSettings(o.home)
    explainer = createExplainer({
      hub, store, settings, provider: given ? o.provider ?? null : null,
      log: (msg) => logLine(o.home, 'server.log', msg),
      ...(envOff ? { disabledReason: 'Turned off by SIDECAR_EXPLAINER=off.' } : {}),
    })
    pipeline = createPipeline({ store, hub })
    app = createApp({ pipeline, store, hub, settings, explainer, token, port: () => port, version: o.version ?? '0.1.0', staticDir: o.staticDir })
    server = createAdaptorServer({ fetch: app.fetch }) as Server
  } catch (err) {
    store.close()
    releaseLock(o.home)
    throw err
  }

  const first = port
  let bound = false
  try {
    for (port = first; port <= first + 10; port++) {
      if (await listen(server, port)) { bound = true; break }
    }
  } catch (err) {
    store.close()
    releaseLock(o.home)
    throw err
  }
  if (!bound) {
    store.close()
    releaseLock(o.home)
    throw new Error(`no free port in ${first}-${first + 10}`)
  }
  writePort(o.home, port)
  const ws = attachWs(server, { hub, store, token, port: () => port, explainerState: explainer.state })
  logLine(o.home, 'server.log', `listening on 127.0.0.1:${port}`)
  const logChoice = (p: Provider | null) =>
    logLine(o.home, 'server.log', `explanations: ${explainer.state().status}${p ? ` via ${p.id}` : ''}`)
  logChoice(given ? o.provider ?? null : null)

  let closed = false
  // detection can take seconds (claude --version), so it runs after the server is listening
  if (!given && !envOff) {
    void pickProvider({ env: process.env, hasClaude: claudeAvailable() })
      .then((p) => {
        if (closed) return
        explainer.setProvider(p)
        logChoice(p)
      })
      .catch(() => undefined)
  }
  const close = async () => {
    if (closed) return
    closed = true
    clearInterval(timer)
    explainer.stop()
    ws.close()
    server.closeAllConnections?.()
    await new Promise<void>((r) => server.close(() => r()))
    store.close()
    releaseLock(o.home)
    logLine(o.home, 'server.log', 'stopped')
  }

  const idleMs = o.idleMs ?? 2 * 60 * 60 * 1000
  const timer = setInterval(() => {
    pipeline.sweep()
    if (ws.clientCount() === 0 && Date.now() - pipeline.lastActivity() > idleMs) void close()
  }, o.sweepMs ?? 60_000)
  timer.unref()

  return { port, token, close }
}
