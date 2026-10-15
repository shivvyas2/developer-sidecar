import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const wf = readFileSync(join(__dirname, '..', '..', '.github', 'workflows', 'release.yml'), 'utf8')
const at = (needle: string) => {
  const i = wf.indexOf(needle)
  expect(i, `release.yml should contain ${needle}`).toBeGreaterThanOrEqual(0)
  return i
}

test('release notes are checked before the release branch is touched', () => {
  expect(at('release-tree.mjs notes')).toBeLessThan(at('git -C ../release push origin release'))
})

test('a re-run with an unchanged tree does not fail on an empty commit', () => {
  expect(wf).toMatch(/git -C \.\.\/release diff --cached --quiet \|\|/)
})

test('a re-run does not fail when the GitHub Release already exists', () => {
  expect(wf).toMatch(/gh release view "\$TAG"[^\n]*\|\|[^\n]*gh release create/)
})
