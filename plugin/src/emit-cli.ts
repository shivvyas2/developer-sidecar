import { randomUUID } from 'node:crypto'
import { sidecarHome } from '@sidecar/shared/home'
import { runEmit } from './emit'

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

readStdin()
  .then((stdin) => runEmit({ stdin, env: process.env, home: sidecarHome(), now: Date.now(), id: randomUUID(), fetch }))
  .catch(() => undefined)
  .finally(() => process.exit(0))
