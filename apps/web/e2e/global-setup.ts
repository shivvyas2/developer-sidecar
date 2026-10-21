import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SESSIONS } from '../../../bench/explainer/sessions'
import { callsLog, freePort, ROOT, runScript, serverOf, sidecarEnv, untilRecapsReady } from './server'

export default async function globalSetup(): Promise<() => Promise<void>> {
  const home = mkdtempSync(join(tmpdir(), 'sidecar-e2e-'))
  const wanted = await freePort()
  const env = { ...sidecarEnv(home), SIDECAR_PORT: String(wanted) }
  const lines = readFileSync(join(ROOT, 'packages/server/test/fixtures/session-basic.jsonl'), 'utf8').trim().split('\n')
  runScript('start-server.cjs', lines[0]!, env)
  await untilRecapsReady(home)
  // A realistic session from the token bench (37 steps: a feature, a failing then passing test, commits),
  // sent before the basic one so smoke-1 stays the newest session and the one the page opens on.
  for (const e of SESSIONS.find((s) => s.name === 'build-stripe-app')!.events) runScript('emit.cjs', JSON.stringify(e.payload), env)
  for (const line of lines.slice(1)) runScript('emit.cjs', line, env)
  const { port } = serverOf(home)
  if (port !== String(wanted)) throw new Error(`e2e server took port ${port}, not the free port ${wanted}`)
  const pid = Number(readFileSync(join(home, 'server.pid'), 'utf8'))
  process.env.SIDECAR_E2E_URL = `http://127.0.0.1:${port}/`
  process.env.SIDECAR_E2E_HOME = home
  process.env.SIDECAR_E2E_CALLS = callsLog(home)
  return async () => {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
}
