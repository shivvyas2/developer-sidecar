import { mkdtempSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  DEFAULT_PORT, acquireLock, ensureHome, ensureToken, logLine, readPort, readToken,
  releaseLock, sidecarHome, writePort,
} from '@sidecar/shared/home'

let home: string
beforeEach(() => {
  home = join(mkdtempSync(join(tmpdir(), 'sidecar-')), 'h')
  ensureHome(home)
})

describe('home', () => {
  test('SIDECAR_HOME overrides default', () => {
    expect(sidecarHome({ SIDECAR_HOME: '/x' })).toBe('/x')
    expect(sidecarHome({})).toMatch(/\.developer-sidecar$/)
  })
  test('token is created once, 64 hex chars, mode 600', () => {
    expect(readToken(home)).toBeNull()
    const t = ensureToken(home)
    expect(t).toMatch(/^[0-9a-f]{64}$/)
    expect(ensureToken(home)).toBe(t)
    expect(readToken(home)).toBe(t)
    expect(statSync(join(home, 'token')).mode & 0o777).toBe(0o600)
  })
  test('port defaults and round-trips', () => {
    expect(readPort(home)).toBe(DEFAULT_PORT)
    writePort(home, 7380)
    expect(readPort(home)).toBe(7380)
    writeFileSync(join(home, 'port'), 'garbage')
    expect(readPort(home)).toBe(DEFAULT_PORT)
  })
  test('lock: second acquire fails while holder alive', () => {
    expect(acquireLock(home, process.pid)).toBe(true)
    expect(acquireLock(home, process.pid)).toBe(false)
    releaseLock(home)
    expect(acquireLock(home, process.pid)).toBe(true)
  })
  test('lock: stale pid is reclaimed', () => {
    writeFileSync(join(home, 'server.pid'), '999999')
    expect(acquireLock(home, process.pid)).toBe(true)
    expect(readFileSync(join(home, 'server.pid'), 'utf8')).toBe(String(process.pid))
  })
  test('logLine appends and never throws', () => {
    logLine(home, 'emit.log', 'hello')
    expect(readFileSync(join(home, 'logs', 'emit.log'), 'utf8')).toMatch(/hello\n$/)
    expect(() => logLine('/nonexistent/\0bad', 'x.log', 'y')).not.toThrow()
  })
})
