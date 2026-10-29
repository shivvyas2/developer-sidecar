import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SESSIONS } from '../../../bench/explainer/sessions'

const ROOT = resolve(import.meta.dirname, '../../..')

/** A port the OS says is free, so the e2e server never lands on a live sidecar's 7377. */
const freePort = () => new Promise<number>((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => resolve(port)) })
})

/**
 * The server finds the claude command in the background. A turn that ends before then is caught up once it is
 * found, but only each session's newest one (one call per session), and the tests count one call for every
 * turn of the three-turn sample session, so wait for it before sending any.
 */
async function untilRecapsReady(home: string) {
  for (let i = 0; i < 100; i++) {
    try {
      const port = readFileSync(join(home, 'port'), 'utf8').trim()
      const token = readFileSync(join(home, 'token'), 'utf8').trim()
      const res = await fetch(`http://127.0.0.1:${port}/api/explainer`, { headers: { 'x-sidecar-token': token } })
      if (res.ok && ((await res.json()) as { status: string }).status === 'ready') return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('AI recaps never became ready (is e2e/fake-claude/claude executable?)')
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const home = mkdtempSync(join(tmpdir(), 'sidecar-e2e-'))
  const wanted = await freePort()
  // AI recaps run through the real CLI provider against a fake claude command (e2e/fake-claude), so no
  // network and no cost; an API key would take precedence, so it is blanked.
  const { SIDECAR_EXPLAINER: _off, ...base } = process.env
  const calls = join(home, 'claude-calls.log')
  const env = {
    ...base, SIDECAR_HOME: home, SIDECAR_PORT: String(wanted), ANTHROPIC_API_KEY: '', SIDECAR_E2E_CALLS: calls,
    PATH: `${join(ROOT, 'apps/web/e2e/fake-claude')}:${process.env.PATH ?? ''}`,
  }
  const lines = readFileSync(join(ROOT, 'packages/server/test/fixtures/session-basic.jsonl'), 'utf8').trim().split('\n')
  const run = (script: string, input: string) => {
    const r = spawnSync(process.execPath, [join(ROOT, 'plugin/dist', script)], { input, env, encoding: 'utf8', timeout: 15000 })
    if (r.status !== 0) throw new Error(`${script} exited ${r.status}: ${r.stderr}`)
  }
  run('start-server.cjs', lines[0]!)
  await untilRecapsReady(home)
  // A realistic session from the token bench (37 steps: a feature, a failing then passing test, commits),
  // sent before the basic one so smoke-1 stays the newest session and the one the page opens on.
  for (const e of SESSIONS.find((s) => s.name === 'build-stripe-app')!.events) run('emit.cjs', JSON.stringify(e.payload))
  for (const line of lines.slice(1)) run('emit.cjs', line)
  const port = readFileSync(join(home, 'port'), 'utf8').trim()
  if (port !== String(wanted)) throw new Error(`e2e server took port ${port}, not the free port ${wanted}`)
  const pid = Number(readFileSync(join(home, 'server.pid'), 'utf8'))
  process.env.SIDECAR_E2E_URL = `http://127.0.0.1:${port}/`
  process.env.SIDECAR_E2E_HOME = home
  process.env.SIDECAR_E2E_CALLS = calls
  return async () => {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
}
