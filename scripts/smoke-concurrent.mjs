// Two Claude sessions starting at once must end with exactly one sidecar server.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const startPayload = (sid) => JSON.stringify({ session_id: sid, cwd: '/tmp/demo', hook_event_name: 'SessionStart' })

function runStart(env, sid) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['plugin/dist/start-server.cjs'], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('exit', () => resolve(out))
    child.stdin.end(startPayload(sid))
  })
}

function sidecarPids(home) {
  return new Promise((resolve) => {
    const ps = spawn('ps', ['-Ao', 'pid=,command='])
    let out = ''
    ps.stdout.on('data', (d) => (out += d))
    ps.on('exit', () => {
      // servers inherit SIDECAR_HOME, so match on the bundle path and check env via the pid file/port instead
      resolve(out.split('\n').filter((l) => l.includes('plugin/dist/server.cjs')).map((l) => Number(l.trim().split(/\s+/)[0])))
    })
  })
}

const rounds = Number(process.argv[2] ?? 5)
for (let i = 0; i < rounds; i++) {
  const home = mkdtempSync(join(tmpdir(), 'sidecar-race-'))
  const env = { ...process.env, SIDECAR_HOME: home, SIDECAR_EXPLAINER: 'off' }
  const before = new Set(await sidecarPids(home))
  const outs = await Promise.all([runStart(env, `a${i}`), runStart(env, `b${i}`)])
  await new Promise((r) => setTimeout(r, 500))
  const mine = (await sidecarPids(home)).filter((p) => !before.has(p))
  try {
    for (const o of outs) assert.match(o, /Sidecar live at/, `a session reported failure: ${o}`)
    assert.equal(mine.length, 1, `round ${i}: expected 1 server, found ${mine.length}`)
    const port = readFileSync(join(home, 'port'), 'utf8').trim()
    const token = readFileSync(join(home, 'token'), 'utf8').trim()
    const sessions = await (await fetch(`http://127.0.0.1:${port}/api/sessions`, { headers: { 'x-sidecar-token': token } })).json()
    assert.equal(sessions.length, 2, `round ${i}: expected both sessions on the one server`)
  } finally {
    for (const p of mine) { try { process.kill(p, 'SIGTERM') } catch {} }
    await new Promise((r) => setTimeout(r, 200))
  }
}
console.log(`concurrent smoke OK: ${rounds} rounds, one server each`)
