import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'

/** Shared by global-setup.ts and the specs that start a server of their own, so the two never drift. */
export const ROOT = resolve(import.meta.dirname, '../../..')

/** A port the OS says is free, so the e2e server never lands on a live sidecar's 7377. */
export const freePort = () => new Promise<number>((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => resolve(port)) })
})

/** Where the fake claude command logs each call, so a test can count them. */
export const callsLog = (home: string) => join(home, 'claude-calls.log')

/**
 * The environment for a server and its hooks on `home`. AI recaps run through the real CLI provider against
 * a fake claude command (e2e/fake-claude), so no network and no cost; an API key would take precedence, so
 * it is blanked.
 */
export function sidecarEnv(home: string): NodeJS.ProcessEnv {
  const { SIDECAR_EXPLAINER: _off, ...base } = process.env
  return {
    ...base, SIDECAR_HOME: home, ANTHROPIC_API_KEY: '', SIDECAR_E2E_CALLS: callsLog(home),
    PATH: `${join(ROOT, 'apps/web/e2e/fake-claude')}:${process.env.PATH ?? ''}`,
  }
}

/** Runs one of the plugin's scripts (start-server.cjs, emit.cjs) with `input` on stdin, as Claude Code would. */
export function runScript(script: string, input: string, env: NodeJS.ProcessEnv) {
  const r = spawnSync(process.execPath, [join(ROOT, 'plugin/dist', script)], { input, env, encoding: 'utf8', timeout: 15000 })
  if (r.status !== 0) throw new Error(`${script} exited ${r.status}: ${r.stderr}`)
}

/** Sends one hook payload to the server on `home`. */
export const emit = (home: string, payload: object) => runScript('emit.cjs', JSON.stringify(payload), sidecarEnv(home))

/** The server's address and token, once it has written them. */
export function serverOf(home: string) {
  const port = readFileSync(join(home, 'port'), 'utf8').trim()
  return { port, url: `http://127.0.0.1:${port}`, token: readFileSync(join(home, 'token'), 'utf8').trim() }
}

/**
 * The server finds the claude command in the background. A turn that ends before then is caught up once it is
 * found, but only each session's newest one (one call per session), and the tests count one call for every
 * turn of the three-turn sample session, so wait for it before sending any.
 */
export async function untilRecapsReady(home: string) {
  for (let i = 0; i < 100; i++) {
    try {
      const { url, token } = serverOf(home)
      const res = await fetch(`${url}/api/explainer`, { headers: { 'x-sidecar-token': token } })
      if (res.ok && ((await res.json()) as { status: string }).status === 'ready') return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('AI recaps never became ready (is e2e/fake-claude/claude executable?)')
}
