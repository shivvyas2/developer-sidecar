import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { assemble, changelogSection, REQUIRED } from '../../scripts/release-tree.mjs'

function fakeRepo(skip?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'sc-rel-'))
  const files = [...REQUIRED.map((p) => `plugin/${p}`), 'README.md', 'LICENSE', 'plugin/src/emit.ts', 'plugin/test/x.test.ts', 'plugin/package.json', 'plugin/mod-test/a.test.ts']
  for (const f of files) {
    if (f === `plugin/${skip}`) continue
    mkdirSync(dirname(join(root, f)), { recursive: true })
    writeFileSync(join(root, f), 'x')
  }
  mkdirSync(join(root, 'plugin/dist/web/assets'), { recursive: true })
  writeFileSync(join(root, 'plugin/dist/web/assets/app.js'), 'x')
  return root
}

const walk = (dir: string, base = ''): string[] =>
  readdirSync(join(dir, base), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(dir, join(base, d.name)) : [join(base, d.name)]))

test('the release tree holds the built plugin and nothing from source', () => {
  const root = fakeRepo()
  const out = mkdtempSync(join(tmpdir(), 'sc-out-'))
  assemble(root, out)
  const files = walk(out).sort()
  for (const p of REQUIRED) expect(files).toContain(join('plugin', p))
  expect(files).toContain(join('plugin', 'dist/web/assets/app.js'))
  expect(files).toContain(join('plugin', 'README.md'))
  expect(files).toContain(join('plugin', 'LICENSE'))
  expect(files).toContain('README.md')
  expect(files.some((f) => /plugin\/(src|test|mod-test)\//.test(f) || f.endsWith('package.json'))).toBe(false)
})

test('a missing dist file fails instead of shipping a broken plugin', () => {
  const root = fakeRepo('dist/mod/register.js')
  expect(() => assemble(root, mkdtempSync(join(tmpdir(), 'sc-out-')))).toThrow(/dist\/mod\/register\.js/)
})

test('changelogSection returns one version, without the next', () => {
  const text = '# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-01\n\n- B\n\n## [0.1.0] - 2026-10-15\n\n### Added\n\n- A\n'
  expect(changelogSection(text, '0.1.0')).toBe('### Added\n\n- A')
  expect(changelogSection(text, '0.2.0')).toBe('- B')
  expect(() => changelogSection(text, '9.9.9')).toThrow(/9\.9\.9/)
})
