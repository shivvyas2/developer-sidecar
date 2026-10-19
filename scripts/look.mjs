// Replays the token bench's sample sessions into a throwaway server and saves screenshots of the
// workstation, for reviewing a visual change by eye (before and after shots in a pull request).
// The explainer is off, so this never calls a model. Needs a build first (pnpm build).
//
//   pnpm look                      every sample session
//   pnpm look build-stripe-app     just one
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { SESSIONS } from '../bench/explainer/sessions.ts'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'look')
const wanted = process.argv.slice(2)
const sessions = wanted.length ? SESSIONS.filter((s) => wanted.includes(s.name)) : SESSIONS
if (!sessions.length) throw new Error(`no sample session named ${wanted.join(', ')}; try ${SESSIONS.map((s) => s.name).join(', ')}`)

// A port the OS says is free, so this never lands on a live sidecar's 7377.
const freePort = () => new Promise((done) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)) })
})

const home = mkdtempSync(join(tmpdir(), 'sidecar-look-'))
const env = { ...process.env, SIDECAR_HOME: home, SIDECAR_EXPLAINER: 'off', SIDECAR_PORT: String(await freePort()) }
const run = (script, payload) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'plugin/dist', script)], { input: JSON.stringify(payload), env, encoding: 'utf8', timeout: 15000 })
  if (r.status !== 0) throw new Error(`${script} exited ${r.status}: ${r.stderr}`)
}

mkdirSync(OUT, { recursive: true })
run('start-server.cjs', sessions[0].events[0].payload)
const pid = Number(readFileSync(join(home, 'server.pid'), 'utf8'))
const port = readFileSync(join(home, 'port'), 'utf8').trim()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  for (const s of sessions) {
    await page.goto(`http://127.0.0.1:${port}/?intro=0`)
    const mid = Math.floor(s.events.length / 2)
    for (const [i, e] of s.events.entries()) {
      run('emit.cjs', e.payload)
      if (i === 0) await page.locator('select.hdr__session').selectOption(String(e.payload.session_id)).catch(() => {})
      if (i === mid) { await page.waitForTimeout(2500); await page.screenshot({ path: join(OUT, `${s.name}-mid.png`) }) }
    }
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(OUT, `${s.name}-end.png`) })
    console.log(`look: ${s.name}-mid.png, ${s.name}-end.png`)
  }
  await page.goto(`http://127.0.0.1:${port}/#/kit`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(OUT, 'kit.png') })
  console.log(`look: kit.png, all in ${OUT}`)
} finally {
  await browser.close()
  try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
}
