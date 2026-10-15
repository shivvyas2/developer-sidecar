import { ESLint } from 'eslint'
import { expect, test } from 'vitest'

const lint = async (code: string, filePath: string) => {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(code, { filePath })
  return result!.messages.map((m) => m.ruleId)
}

test('the mod may not import Node or the home helpers', async () => {
  expect(await lint("import { readFileSync } from 'node:fs'\nexport const x = readFileSync\n", 'plugin/src/mod/bad.ts')).toContain('no-restricted-imports')
  expect(await lint("import { sidecarHome } from '@sidecar/shared/home'\nexport const x = sidecarHome\n", 'plugin/src/mod/bad.ts')).toContain('no-restricted-imports')
})

test('the same imports are fine outside the mod', async () => {
  expect(await lint("import { readFileSync } from 'node:fs'\nexport const x = readFileSync\n", 'plugin/src/bad.ts')).not.toContain('no-restricted-imports')
})
