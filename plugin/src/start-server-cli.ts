import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ensureHome, sidecarHome } from '@sidecar/shared/home'
import { runEmit } from './emit'
import { ensureServer } from './start-server'

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  const stdin = await readStdin()
  if (process.env.CLAUDE_CODE_REMOTE === 'true' || process.env.SIDECAR_INTERNAL === '1') return
  const home = sidecarHome()
  ensureHome(home)
  const serverPath = join(dirname(process.argv[1] ?? '.'), 'server.cjs')
  const result = await ensureServer({
    home,
    serverPath,
    fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    spawnServer: (path) => {
      const log = openSync(join(home, 'logs', 'server.log'), 'a')
      spawn(process.execPath, [path], { detached: true, stdio: ['ignore', log, log] }).unref()
    },
  })
  await runEmit({ stdin, env: process.env, home, now: Date.now(), id: randomUUID(), fetch })
  const message = result.ok
    ? `Sidecar live at http://localhost:${result.port}`
    : 'Sidecar could not start, see ~/.developer-sidecar/logs/server.log'
  process.stdout.write(JSON.stringify({ systemMessage: message }))
}

main().catch(() => undefined).finally(() => process.exit(0))
