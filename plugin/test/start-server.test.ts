import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { ensureHome, writePort } from '@sidecar/shared/home'
import { ensureServer } from '../src/start-server'

const home = () => {
  const h = join(mkdtempSync(join(tmpdir(), 'sc-')), 'h')
  ensureHome(h)
  return h
}
const healthy = (async () => Response.json({ ok: true, name: 'developer-sidecar' })) as unknown as typeof fetch
const down = (async () => { throw new Error('down') }) as unknown as typeof fetch

describe('ensureServer', () => {
  test('already up → no spawn', async () => {
    const h = home(); writePort(h, 7390)
    const spawnServer = vi.fn()
    expect(await ensureServer({ home: h, serverPath: 's.cjs', fetch: healthy, spawnServer, sleep: async () => {} }))
      .toEqual({ ok: true, port: 7390, started: false })
    expect(spawnServer).not.toHaveBeenCalled()
  })
  test('down → spawns once, polls until healthy', async () => {
    const h = home()
    let calls = 0
    const f = (async () => { if (++calls < 3) throw new Error('down'); return Response.json({ ok: true, name: 'developer-sidecar' }) }) as unknown as typeof fetch
    // the spawned server writes its port file once it listens
    const spawnServer = vi.fn(() => writePort(h, 7381))
    expect(await ensureServer({ home: h, serverPath: 's.cjs', fetch: f, spawnServer, sleep: async () => {} }))
      .toEqual({ ok: true, port: 7381, started: true })
    expect(spawnServer).toHaveBeenCalledWith('s.cjs')
  })
  test('a home with no port file is never up, even if a sidecar answers on the default port', async () => {
    const h = home()
    const spawnServer = vi.fn()
    const r = await ensureServer({ home: h, serverPath: 's.cjs', fetch: healthy, spawnServer, sleep: async () => {}, attempts: 2 })
    expect(spawnServer).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ ok: false, started: true })
  })
  test('something else on the port → not ok', async () => {
    const other = (async () => Response.json({ hello: 'world' })) as unknown as typeof fetch
    const r = await ensureServer({ home: home(), serverPath: 's.cjs', fetch: other, spawnServer: () => {}, sleep: async () => {}, attempts: 3 })
    expect(r.ok).toBe(false)
  })
  test('never comes up → not ok after attempts', async () => {
    const r = await ensureServer({ home: home(), serverPath: 's.cjs', fetch: down, spawnServer: () => {}, sleep: async () => {}, attempts: 3 })
    expect(r).toMatchObject({ ok: false, started: true })
  })
})
