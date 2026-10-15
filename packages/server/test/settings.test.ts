import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { fileSettings, memorySettings } from '../src/settings'

const home = () => mkdtempSync(join(tmpdir(), 'sidecar-settings-'))

test('missing or corrupt file falls back to defaults', () => {
  const h = home()
  expect(fileSettings(h).get()).toEqual({ explanations: 'haiku' })
  writeFileSync(join(h, 'settings.json'), '{not json')
  expect(fileSettings(h).get()).toEqual({ explanations: 'haiku' })
  writeFileSync(join(h, 'settings.json'), JSON.stringify({ explanations: 'gpt' }))
  expect(fileSettings(h).get()).toEqual({ explanations: 'haiku' })
})

test('set persists with mode 600 and survives a reload', () => {
  const h = home()
  fileSettings(h).set({ explanations: 'off' })
  expect(fileSettings(h).get()).toEqual({ explanations: 'off' })
  expect(JSON.parse(readFileSync(join(h, 'settings.json'), 'utf8'))).toEqual({ explanations: 'off' })
  expect(statSync(join(h, 'settings.json')).mode & 0o777).toBe(0o600)
})

test('memory settings', () => {
  const s = memorySettings()
  expect(s.set({ explanations: 'sonnet' })).toEqual({ explanations: 'sonnet' })
  expect(s.get()).toEqual({ explanations: 'sonnet' })
})
