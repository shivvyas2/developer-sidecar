import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const home = mkdtempSync(join(tmpdir(), 'sidecar-smoke-'))
const env = { ...process.env, SIDECAR_HOME: home, SIDECAR_EXPLAINER: 'off' }
const lines = readFileSync('packages/server/test/fixtures/session-basic.jsonl', 'utf8').trim().split('\n')

const run = (script, input) => {
  const r = spawnSync(process.execPath, [`plugin/dist/${script}`], { input, env, encoding: 'utf8', timeout: 15000 })
  assert.equal(r.status, 0, `${script} exited ${r.status}: ${r.stderr}`)
  return r.stdout
}

let pid
try {
  const out = run('start-server.cjs', lines[0])
  assert.match(JSON.parse(out).systemMessage, /Sidecar live at http:\/\/localhost:\d+/)
  pid = Number(readFileSync(join(home, 'server.pid'), 'utf8'))
  for (const line of lines.slice(1)) run('emit.cjs', line)

  const port = readFileSync(join(home, 'port'), 'utf8').trim()
  const token = readFileSync(join(home, 'token'), 'utf8').trim()
  const headers = { 'x-sidecar-token': token }
  const steps = await (await fetch(`http://127.0.0.1:${port}/api/sessions/smoke-1/steps`, { headers })).json()

  assert.deepEqual(steps.map((s) => [s.category, s.status]), [
    ['prompt', 'ok'], ['install', 'ok'], ['create', 'ok'], ['test', 'failed'],
  ])
  const explainer = await (await fetch(`http://127.0.0.1:${port}/api/explainer`, { headers })).json()
  // SIDECAR_EXPLAINER=off disables the explainer outright
  assert.equal(explainer.provider, null, 'smoke must never call a model')
  assert.equal(explainer.status, 'off', 'smoke must never call a model')
  assert.ok(!JSON.stringify(steps).includes('sk-live-abc'), 'secret leaked into storage')
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text()
  assert.ok(html.includes('name="sidecar-token"'), 'web UI not served')

  const t0 = Date.now()
  spawnSync(process.execPath, ['plugin/dist/emit.cjs'], {
    input: lines[1], env: { ...env, SIDECAR_HOME: join(home, 'nope') }, encoding: 'utf8',
  })
  assert.ok(Date.now() - t0 < 2000, 'emit should return fast with no server')

  console.log(`smoke OK — ${steps.length} steps, port ${port}`)
} finally {
  if (pid) {
    try { process.kill(pid, 'SIGTERM') } catch {}
  }
}
