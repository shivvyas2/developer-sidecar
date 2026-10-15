import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { FONTS } from '@sidecar/ui-kit'
import { pad3 } from '../src/ds/util'

const dir = join(import.meta.dirname, '../src/ds')
const files = readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')] as const)

test('ds/ uses no raw hex colours and no em dashes', () => {
  for (const [f, src] of files) {
    expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(src, f).not.toContain('\u2014')
  }
})

test('ds.css font stacks mirror FONTS', () => {
  const css = files.find(([f]) => f === 'ds.css')?.[1] ?? ''
  expect(css).toContain(`--ds-mono: ${FONTS.mono};`)
  expect(css).toContain(`--ds-dot: ${FONTS.dot};`)
  expect(css).toContain(`--ds-sans: ${FONTS.sans};`)
})

test('pad3 zero-pads to three digits', () => {
  expect([0, 7, 42, 999, 1234].map(pad3)).toEqual(['000', '007', '042', '999', '1234'])
})
