import type { Server } from 'node:http'
import { join } from 'node:path'
import { createAdaptorServer } from '@hono/node-server'
import {
  DEFAULT_PORT, acquireLock, ensureHome, ensureToken, logLine, releaseLock, writePort,
} from '@sidecar/shared/home'
import { createApp } from './app'
import { Hub } from './hub'
import { createPipeline } from './pipeline'
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

export async function startServer(o: StartOptions): Promise<RunningServer> {
  ensureHome(o.home)
  if (!acquireLock(o.home)) throw new Error('already running')

  const token = ensureToken(o.home)
  const store = openStore(join(o.home, 'sidecar.db'))
  const hub = new Hub()
  const pipeline = createPipeline({ store, hub })
  let port = o.preferredPort ?? DEFAULT_PORT
  const app = createApp({ pipeline, store, token, port: () => port, version: o.version ?? '0.1.0', staticDir: o.staticDir })
  const server = createAdaptorServer({ fetch: app.fetch }) as Server

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
  const ws = attachWs(server, { hub, store, token, port: () => port })
  logLine(o.home, 'server.log', `listening on 127.0.0.1:${port}`)

  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    clearInterval(timer)
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
