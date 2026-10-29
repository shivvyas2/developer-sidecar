import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { parseRemote, scanProject } from '../src/scan'

const dirs: string[] = []
function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'sidecar-scan-'))
  dirs.push(root)
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  return root
}
afterEach(() => { for (const d of dirs.splice(0)) { try { chmodSync(join(d, 'locked'), 0o755) } catch { /* no locked folder in this test */ } rmSync(d, { recursive: true, force: true }) } })

describe('scanProject', () => {
  test('lists files relative to the folder, skipping dependencies, git, build output, lockfiles and ignored paths', async () => {
    const root = folder({
      'app/page.tsx': '', 'node_modules/x/index.js': '', '.git/config': '', 'dist/a.js': '', 'package-lock.json': '{}',
      'secret/notes.md': '', '.gitignore': 'secret/\n',
    })
    const b = await scanProject(root)
    expect(b?.files).toEqual(['.gitignore', 'app/page.tsx'])
  })

  test('never opens .env files but lists them', async () => {
    const root = folder({ '.env': 'KEY=1', '.env.local': 'KEY=2', 'package.json': '{}' })
    const opened: string[] = []
    const b = await scanProject(root, { read: (p) => { opened.push(p); return readFile(p, 'utf8') } })
    expect(b?.files).toEqual(expect.arrayContaining(['.env', '.env.local']))
    expect(opened.some((p) => /\.env/.test(p))).toBe(false)
  })

  test('reads dependency names from package.json, requirements.txt and pyproject.toml', async () => {
    const root = folder({
      'package.json': JSON.stringify({ dependencies: { next: '15', stripe: '^17' }, devDependencies: { vitest: '4' } }),
      'requirements.txt': 'django>=4.2\n# a comment\nrequests==2.31\n',
      'pyproject.toml': '[project]\nname = "x"\ndependencies = [\n  "fastapi>=0.110",\n  "uvicorn[standard]",\n]\n',
    })
    const b = await scanProject(root)
    expect(b?.packages).toEqual(expect.arrayContaining(['next', 'stripe', 'vitest', 'django', 'requests', 'fastapi', 'uvicorn']))
  })

  test('stops at the cap and names the folders it did not list', async () => {
    const root = folder({ 'a/1.ts': '', 'a/2.ts': '', 'a/3.ts': '', 'a/4.ts': '', 'b/1.ts': '', 'c/1.ts': '' })
    const b = await scanProject(root, { cap: 3 })
    expect(b?.files).toHaveLength(3)
    expect(b?.truncated).toBe(true)
    expect(b?.folders).toEqual(expect.arrayContaining(['b', 'c']))
  })

  test('survives symlink loops and unreadable folders', async () => {
    const root = folder({ 'app/page.tsx': '', 'locked/x.ts': '' })
    symlinkSync(root, join(root, 'loop'))
    chmodSync(join(root, 'locked'), 0o000)
    const b = await scanProject(root)
    expect(b?.files).toContain('app/page.tsx')
  })

  test('returns null for a missing folder', async () => {
    expect(await scanProject(join(tmpdir(), 'sidecar-scan-does-not-exist-' + Date.now()))).toBeNull()
  })

  test('git facts: the remote, what .gitignore covers, and a README', async () => {
    const root = folder({
      '.git/config': '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:owner/repo.git\n',
      '.gitignore': '.env*\nnode_modules\ndist\n', 'README.md': '# x',
    })
    const b = await scanProject(root)
    expect(b?.git).toEqual({ repo: true, remote: { host: 'github.com', owner: 'owner', name: 'repo' }, ignoresSecrets: true, ignoresDeps: true, ignoresBuild: true, readme: true })
  })

  test('no git and no .gitignore', async () => {
    const b = await scanProject(folder({ 'index.html': '' }))
    expect(b?.git).toEqual({ repo: false, remote: null, ignoresSecrets: false, ignoresDeps: false, ignoresBuild: false, readme: false })
  })

  test('secrets count as ignored only when both .env and .env.local are', async () => {
    const b = await scanProject(folder({ '.git/HEAD': '', '.gitignore': '.env\n' }))
    expect(b?.git.ignoresSecrets).toBe(false)
  })
})

describe('parseRemote', () => {
  test.each([
    ['https://github.com/o/r.git', { host: 'github.com', owner: 'o', name: 'r' }],
    ['git@github.com:o/r.git', { host: 'github.com', owner: 'o', name: 'r' }],
    ['https://gitlab.com/o/r', { host: 'gitlab.com', owner: 'o', name: 'r' }],
    ['nonsense', null],
  ])('%s', (url, want) => expect(parseRemote(url)).toEqual(want))
})

describe('review fixes', () => {
  test('never scans a home folder or a filesystem root', async () => {
    const home = folder({ 'Documents/tax.pdf': '' })
    expect(await scanProject(home, { home })).toBeNull()
    expect(await scanProject('/')).toBeNull()
  })
  test.each([
    ['https://gitlab.com/group/sub/r.git', { host: 'gitlab.com', owner: 'group/sub', name: 'r' }],
    ['ssh://git@github.com:22/o/r.git', { host: 'github.com', owner: 'o', name: 'r' }],
  ])('parseRemote %s', (url, want) => expect(parseRemote(url)).toEqual(want))
})
