import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..')
const SOURCES = ['apps/web/src', 'packages/shared/src', 'packages/ui-kit/src', 'packages/server/src', 'plugin/src']
// Pictographs, dingbat and miscellaneous-symbol emoji, and the emoji presentation selector.
// The drafting marks ✓ (U+2713) and ✕ (U+2715) are text symbols and stay allowed.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}\u{2716}-\u{27BF}\u{2B50}\u{2B55}]|\u{FE0F}/u

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : /\.(ts|tsx|css|html)$/.test(d.name) ? [join(dir, d.name)] : [])

test('the product shows no emoji: the drafting language uses text marks only', () => {
  const hits = SOURCES.flatMap((s) => files(join(ROOT, s))).flatMap((f) =>
    readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (EMOJI.test(line) ? [`${relative(ROOT, f)}:${i + 1}`] : [])))
  expect(hits).toEqual([])
})
