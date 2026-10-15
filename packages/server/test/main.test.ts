import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { WebSocket } from 'ws'
import { SIDECAR_NAME, type ServerMessage } from '@sidecar/shared'
import { sidecarAnswers, startServer, type RunningServer } from '../src/main'

const running: RunningServer[] = []
const blockers: Server[] = []
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.close()))
  blockers.splice(0).forEach((b) => b.close())
})
const home = () => join(mkdtempSync(join(tmpdir(), 'sidecar-')), 'h')
const basePort = () => 40000 + Math.floor(Math.random() * 20000)

async function start(o: Parameters<typeof startServer>[0]) {
  const s = await startServer({ provider: null, ...o })
  running.push(s)
  return s
}

async function post(s: RunningServer, body: unknown) {
  return fetch(`http://127.0.0.1:${s.port}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sidecar-token': s.token },
    body: JSON.stringify(body),
  })
}

function collect(url: string, n: number): Promise<ServerMessage[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const got: ServerMessage[] = []
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMessage
      if (m.type === 'explainer') return
      got.push(m)
      if (got.length >= n) { ws.close(); resolve(got) }
    })
    ws.on('error', reject)
  })
}

describe('startServer', () => {
  test('binds preferred port and writes port file', async () => {
    const h = home(); const p = basePort()
    const s = await start({ home: h, preferredPort: p })
    expect(s.port).toBe(p)
    expect(readFileSync(join(h, 'port'), 'utf8')).toBe(String(p))
    const r = await fetch(`http://127.0.0.1:${p}/health`)
    expect((await r.json()).name).toBe('developer-sidecar')
  })

  test('falls back to next port when taken', async () => {
    const p = basePort()
    const blocker = createServer().listen(p, '127.0.0.1')
    blockers.push(blocker)
    await new Promise((r) => blocker.once('listening', r))
    const s = await start({ home: home(), preferredPort: p })
    expect(s.port).toBe(p + 1)
  })

  test('second start on the same home fails with already running', async () => {
    const h = home()
    await start({ home: h, preferredPort: basePort() })
    await expect(startServer({ home: h, preferredPort: basePort(), provider: null })).rejects.toThrow('already running')
  })

  test('close releases the lock so a new server can start', async () => {
    const h = home()
    const s = await startServer({ home: h, preferredPort: basePort(), provider: null })
    await s.close()
    await start({ home: h, preferredPort: basePort() })
  })

  test('websocket: rejects bad token, replays after seq, then streams live', async () => {
    const s = await start({ home: home(), preferredPort: basePort() })
    const bad = new WebSocket(`ws://127.0.0.1:${s.port}/ws?token=nope`)
    await new Promise<void>((resolve) => bad.on('error', () => resolve()).on('unexpected-response', () => resolve()))

    await post(s, { id: 'e1', sessionId: 's1', ts: 1, cwd: '/p', kind: 'prompt', prompt: 'one' })
    await post(s, { id: 'e2', sessionId: 's1', ts: 2, cwd: '/p', kind: 'prompt', prompt: 'two' })

    const replay = await collect(`ws://127.0.0.1:${s.port}/ws?token=${s.token}&after=1`, 1)
    expect(replay[0]).toMatchObject({ type: 'step', step: { seq: 2, caption: 'You asked: “two”' } })

    const live = collect(`ws://127.0.0.1:${s.port}/ws?token=${s.token}&after=2`, 2)
    await new Promise((r) => setTimeout(r, 50))
    await post(s, { id: 'e3', sessionId: 's1', ts: 3, cwd: '/p', kind: 'prompt', prompt: 'three' })
    const msgs = await live
    expect(msgs.map((m) => m.type)).toEqual(['session', 'step'])
  })

  test('websocket sends the explainer state first', async () => {
    const s = await start({ home: home(), preferredPort: basePort() })
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws?token=${s.token}&after=0`)
    const first = await new Promise<ServerMessage>((resolve) => ws.once('message', (d) => resolve(JSON.parse(String(d)) as ServerMessage)))
    ws.close()
    expect(first).toMatchObject({ type: 'explainer', state: { status: 'unavailable', provider: null } })
  })

  test('idle shutdown closes the server', async () => {
    const h = home()
    const s = await startServer({ home: h, preferredPort: basePort(), provider: null, idleMs: 50, sweepMs: 20 })
    await new Promise((r) => setTimeout(r, 200))
    await expect(fetch(`http://127.0.0.1:${s.port}/health`)).rejects.toThrow()
    await start({ home: h, preferredPort: basePort() })
  })
})

describe('single instance hardening', () => {
  test('two concurrent starts on one home → exactly one server', async () => {
    const h = home(); const p = basePort()
    const results = await Promise.allSettled([startServer({ home: h, preferredPort: p, provider: null }), startServer({ home: h, preferredPort: p, provider: null })])
    const ok = results.filter((r): r is PromiseFulfilledResult<RunningServer> => r.status === 'fulfilled')
    ok.forEach((r) => running.push(r.value))
    expect(ok).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { message: 'already running' } })
  })
  test('lock held by a live non-sidecar pid (recycled pid) does not block startup', async () => {
    const h = home()
    const { ensureHome } = await import('@sidecar/shared/home')
    ensureHome(h)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(h, 'server.pid'), '1')
    const s = await start({ home: h, preferredPort: basePort(), lockWaitMs: 200 })
    expect(readFileSync(join(h, 'server.pid'), 'utf8')).toBe(String(process.pid))
    expect(s.port).toBeGreaterThan(0)
  })
  test('a home with no port file never answers for a sidecar on the default port', async () => {
    const { DEFAULT_PORT, ensureHome } = await import('@sidecar/shared/home')
    // make sure some sidecar answers on the default port: the dogfood one, or our own
    const healthy = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/health`, { signal: AbortSignal.timeout(300) })
      .then(async (r) => ((await r.json()) as { name?: string }).name === SIDECAR_NAME).catch(() => false)
    if (!healthy) await start({ home: home(), preferredPort: DEFAULT_PORT })
    const h = home()
    ensureHome(h)
    expect(await sidecarAnswers(h)).toBe(false)
  })
})
