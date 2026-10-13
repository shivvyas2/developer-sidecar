import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_PORT = 7377

export function sidecarHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.SIDECAR_HOME ?? join(homedir(), '.developer-sidecar')
}

export function ensureHome(home: string): void {
  mkdirSync(join(home, 'logs'), { recursive: true, mode: 0o700 })
}

function readTrim(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}

export function readToken(home: string): string | null {
  const t = readTrim(join(home, 'token'))
  return t && /^[0-9a-f]{64}$/.test(t) ? t : null
}

export function ensureToken(home: string): string {
  const existing = readToken(home)
  if (existing) return existing
  const token = randomBytes(32).toString('hex')
  writeFileSync(join(home, 'token'), token, { mode: 0o600 })
  return token
}

export function writePort(home: string, port: number): void {
  writeFileSync(join(home, 'port'), String(port))
}

export function readPort(home: string): number {
  const n = Number(readTrim(join(home, 'port')))
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function acquireLock(home: string, pid: number = process.pid): boolean {
  const file = join(home, 'server.pid')
  const held = Number(readTrim(file))
  if (Number.isInteger(held) && held > 0 && isAlive(held)) return false
  writeFileSync(file, String(pid))
  return true
}

export function releaseLock(home: string): void {
  rmSync(join(home, 'server.pid'), { force: true })
}

export function logLine(home: string, file: string, msg: string): void {
  try {
    appendFileSync(join(home, 'logs', file), `${new Date().toISOString()} ${msg}\n`)
  } catch {
    // logging must never break the caller
  }
}
