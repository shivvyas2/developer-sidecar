import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { ensureHome, ensureToken, writePort } from '@sidecar/shared/home'
import { locate } from '../src/locate'

const home = () => { const h = mkdtempSync(join(tmpdir(), 'sc-locate-')); ensureHome(h); return h }

test('reads the port and token the server wrote', () => {
  const h = home()
  writePort(h, 7391)
  const token = ensureToken(h)
  expect(locate(h)).toEqual({ port: 7391, token })
})

test('no token yet reads null, never throws', () => {
  const h = home()
  expect(locate(h).token).toBeNull()
})
