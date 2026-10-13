import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { ensureHome, ensureToken, writePort } from '@sidecar/shared/home'
import { loadEnvSecrets } from '../src/env-secrets'
import { runEmit, type EmitDeps } from '../src/emit'

function setup() {
  const home = join(mkdtempSync(join(tmpdir(), 'sc-')), 'h')
  ensureHome(home)
  const token = ensureToken(home)
  writePort(home, 7399)
  const cwd = mkdtempSync(join(tmpdir(), 'proj-'))
  return { home, token, cwd }
}

const payload = (cwd: string, extra: object = {}) => JSON.stringify({
  session_id: 's1', cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, ...extra,
})

const deps = (over: Partial<EmitDeps> & Pick<EmitDeps, 'home' | 'stdin'>): EmitDeps => ({
  env: {}, now: 1, id: 'e1', fetch: vi.fn(async () => new Response(null, { status: 202 })) as unknown as typeof fetch, ...over,
})

describe('loadEnvSecrets', () => {
  test('reads .env and .env.local, skips examples and short values', () => {
    const { cwd } = setup()
    writeFileSync(join(cwd, '.env'), 'A=supersecret1\nB="quoted-secret"\nSHORT=abc\n# C=commented12345\n')
    writeFileSync(join(cwd, '.env.local'), "export D='localsecret9'\n")
    writeFileSync(join(cwd, '.env.example'), 'E=exampleval123\n')
    expect(loadEnvSecrets(cwd).sort()).toEqual(['localsecret9', 'quoted-secret', 'supersecret1'])
  })
  test('missing dir → []', () => {
    expect(loadEnvSecrets('/definitely/not/here')).toEqual([])
  })
})

describe('runEmit', () => {
  test('POSTs scrubbed event to the port with the token', async () => {
    const { home, token, cwd } = setup()
    writeFileSync(join(cwd, '.env'), 'KEY=mysecretvalue\n')
    const d = deps({ home, stdin: payload(cwd, { tool_input: { command: 'echo mysecretvalue' } }) })
    expect(await runEmit(d)).toBe('sent')
    const [url, init] = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:7399/events')
    expect(init.headers['x-sidecar-token']).toBe(token)
    expect(init.body).not.toContain('mysecretvalue')
    expect(JSON.parse(init.body)).toMatchObject({ id: 'e1', kind: 'tool_start', sessionId: 's1' })
  })
  test.each([['SIDECAR_INTERNAL', '1'], ['CLAUDE_CODE_REMOTE', 'true']])('%s guard → skipped, no fetch', async (k, v) => {
    const { home, cwd } = setup()
    const d = deps({ home, stdin: payload(cwd), env: { [k]: v } })
    expect(await runEmit(d)).toBe('skipped')
    expect(d.fetch).not.toHaveBeenCalled()
  })
  test('bad JSON → failed, never throws', async () => {
    const { home } = setup()
    expect(await runEmit(deps({ home, stdin: '{nope' }))).toBe('failed')
  })
  test('no token yet (server never started) → skipped', async () => {
    const home = join(mkdtempSync(join(tmpdir(), 'sc-')), 'h')
    ensureHome(home)
    expect(await runEmit(deps({ home, stdin: payload('/x') }))).toBe('skipped')
  })
  test('server down → failed, never throws', async () => {
    const { home, cwd } = setup()
    const d = deps({ home, stdin: payload(cwd), fetch: (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch })
    expect(await runEmit(d)).toBe('failed')
  })
  test('hanging server → failed within timeout', async () => {
    const { home, cwd } = setup()
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })) as unknown as typeof fetch
    const t0 = Date.now()
    expect(await runEmit(deps({ home, stdin: payload(cwd), fetch: hang, timeoutMs: 100 }))).toBe('failed')
    expect(Date.now() - t0).toBeLessThan(400)
  })
})
