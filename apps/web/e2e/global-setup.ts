import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../../..')

export default async function globalSetup(): Promise<() => Promise<void>> {
  const home = mkdtempSync(join(tmpdir(), 'sidecar-e2e-'))
  const env = { ...process.env, SIDECAR_HOME: home, SIDECAR_EXPLAINER: 'off' }
  const lines = readFileSync(join(ROOT, 'packages/server/test/fixtures/session-basic.jsonl'), 'utf8').trim().split('\n')
  const run = (script: string, input: string) => {
    const r = spawnSync(process.execPath, [join(ROOT, 'plugin/dist', script)], { input, env, encoding: 'utf8', timeout: 15000 })
    if (r.status !== 0) throw new Error(`${script} exited ${r.status}: ${r.stderr}`)
  }
  run('start-server.cjs', lines[0]!)
  for (const line of lines.slice(1)) run('emit.cjs', line)
  const port = readFileSync(join(home, 'port'), 'utf8').trim()
  const pid = Number(readFileSync(join(home, 'server.pid'), 'utf8'))
  process.env.SIDECAR_E2E_URL = `http://127.0.0.1:${port}/`
  return async () => {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
}
