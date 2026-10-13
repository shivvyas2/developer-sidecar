import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createApp, isAllowedHost, isAllowedOrigin } from '../src/app'
import { Hub } from '../src/hub'
import { createPipeline } from '../src/pipeline'
import { openStore } from '../src/store'

const TOKEN = 'a'.repeat(64)
const PORT = 7377
// app.request() with a full URL sets the Host the way @hono/node-server does in production
const U = (path: string) => `http://127.0.0.1:${PORT}${path}`
const H = {}
const AUTH = { 'x-sidecar-token': TOKEN, 'content-type': 'application/json' }

function make(staticDir?: string) {
  const store = openStore(':memory:')
  const pipeline = createPipeline({ store, hub: new Hub() })
  return createApp({ pipeline, store, token: TOKEN, port: () => PORT, version: '0.1.0', staticDir })
}
const event = { id: 'e1', sessionId: 's1', ts: 1, cwd: '/p', kind: 'prompt', prompt: 'hello' }

describe('guards', () => {
  test.each([
    ['127.0.0.1:7377', true], ['localhost:7377', true], ['localhost:7378', false],
    ['evil.com', false], [undefined, false],
  ])('host %s → %s', (host, ok) => expect(isAllowedHost(host, PORT)).toBe(ok))
  test.each([
    [undefined, true], ['http://localhost:7377', true], ['http://127.0.0.1:7377', true],
    ['http://evil.com', false], ['https://localhost:7377', false],
  ])('origin %s → %s', (origin, ok) => expect(isAllowedOrigin(origin, PORT)).toBe(ok))
})

describe('routes', () => {
  test('health needs no token', async () => {
    const r = await make().request(U('/health'), { headers: H })
    expect(await r.json()).toEqual({ ok: true, name: 'developer-sidecar', version: '0.1.0' })
  })
  test('bad host → 403 (DNS rebinding)', async () => {
    const r = await make().request('http://evil.com:7377/health')
    expect(r.status).toBe(403)
  })
  test('bad origin → 403', async () => {
    const r = await make().request(U('/api/sessions'), { headers: { ...AUTH, origin: 'http://evil.com' } })
    expect(r.status).toBe(403)
  })
  test('missing token → 401', async () => {
    const r = await make().request(U('/events'), { method: 'POST', headers: H, body: JSON.stringify(event) })
    expect(r.status).toBe(401)
  })
  test('POST /events → 202 then visible via API', async () => {
    const app = make()
    const r = await app.request(U('/events'), { method: 'POST', headers: AUTH, body: JSON.stringify(event) })
    expect(r.status).toBe(202)
    expect(await r.json()).toEqual({ seq: 1 })
    const sessions = await (await app.request(U('/api/sessions'), { headers: AUTH })).json()
    expect(sessions).toMatchObject([{ id: 's1' }])
    const steps = await (await app.request(U('/api/sessions/s1/steps'), { headers: AUTH })).json()
    expect(steps).toMatchObject([{ category: 'prompt', caption: 'You asked: “hello”' }])
  })
  test('invalid event → 400', async () => {
    const r = await make().request(U('/events'), { method: 'POST', headers: AUTH, body: JSON.stringify({ id: 'x' }) })
    expect(r.status).toBe(400)
  })
  test('non-JSON body → 400', async () => {
    const r = await make().request(U('/events'), { method: 'POST', headers: AUTH, body: 'not json' })
    expect(r.status).toBe(400)
  })
  test('oversized body → 413', async () => {
    const big = { ...event, prompt: 'x'.repeat(300 * 1024) }
    const r = await make().request(U('/events'), { method: 'POST', headers: AUTH, body: JSON.stringify(big) })
    expect(r.status).toBe(413)
  })
  test('index.html gets the token meta; assets served; traversal blocked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<html><head></head><body></body></html>')
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)')
    const app = make(dir)
    const html = await (await app.request(U('/'), { headers: H })).text()
    expect(html).toContain(`<meta name="sidecar-token" content="${TOKEN}">`)
    const js = await app.request(U('/assets/app.js'), { headers: H })
    expect(js.headers.get('content-type')).toContain('javascript')
    expect((await app.request(U('/assets/..%2f..%2fetc%2fpasswd'), { headers: H })).status).toBe(404)
  })
  test('no staticDir → plain fallback page', async () => {
    const r = await make().request(U('/'), { headers: H })
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('developer-sidecar')
  })
})
