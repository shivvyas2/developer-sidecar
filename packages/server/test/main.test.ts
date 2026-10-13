import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { WebSocket } from 'ws'
import type { ServerMessage } from '@sidecar/shared'
import { startServer, type RunningServer } from '../src/main'

const running: RunningServer[] = []
const blockers: Server[] = []
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.close()))
  blockers.splice(0).forEach((b) => b.close())
})
const home = () => join(mkdtempSync(join(tmpdir(), 'sidecar-')), 'h')
const basePort = () => 40000 + Math.floor(Math.random() * 20000)

async function start(o: Parameters<typeof startServer>[0]) {
  const s = await startServer(o)
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
      got.push(JSON.parse(String(d)))
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
    await expect(startServer({ home: h, preferredPort: basePort() })).rejects.toThrow('already running')
  })

  test('close releases the lock so a new server can start', async () => {
    const h = home()
    const s = await startServer({ home: h, preferredPort: basePort() })
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

  test('idle shutdown closes the server', async () => {
    const h = home()
    const s = await startServer({ home: h, preferredPort: basePort(), idleMs: 50, sweepMs: 20 })
    await new Promise((r) => setTimeout(r, 200))
    await expect(fetch(`http://127.0.0.1:${s.port}/health`)).rejects.toThrow()
    await start({ home: h, preferredPort: basePort() })
  })
})
