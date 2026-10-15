import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { KIND_BY_HOOK } from '@sidecar/shared'

const hooks = JSON.parse(readFileSync(join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8')).hooks as Record<string, unknown>

test('every hook the payload mapper understands is registered', () => {
  expect(Object.keys(hooks).sort()).toEqual(Object.keys(KIND_BY_HOOK).sort())
})

test('the mod module is declared beside the classic hooks', () => {
  const file = JSON.parse(readFileSync(join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8')) as { modules?: string[] }
  expect(file.modules).toEqual(['../dist/mod/register.js'])
})
