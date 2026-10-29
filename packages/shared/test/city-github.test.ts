import { describe, expect, test } from 'vitest'
import { GUIDANCE, githubAsk, githubGuide } from '../src/city/github'
import type { GitInfo } from '../src/city/baseline'

const none: GitInfo = { repo: false, remote: null, ignoresSecrets: false, ignoresDeps: false, ignoresBuild: false, readme: false }
const full: GitInfo = { repo: true, remote: { host: 'github.com', owner: 'o', name: 'r' }, ignoresSecrets: true, ignoresDeps: true, ignoresBuild: true, readme: true }
const push = (status: 'ok' | 'failed' = 'ok') => ({ category: 'git' as const, status, toolName: 'Bash', input: { command: 'git push -u origin main' } })
const done = (items: ReturnType<typeof githubGuide>) => Object.fromEntries(items.map((i) => [i.id, i.done]))
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}/u

describe('githubGuide', () => {
  test('no git: every item to do, in order', () => {
    const items = githubGuide(none, [])
    expect(items.map((i) => i.id)).toEqual(['repo', 'gitignore', 'readme', 'remote', 'pushed'])
    expect(items.every((i) => !i.done)).toBe(true)
  })
  test('no scan at all reads as nothing done', () => expect(githubGuide(null, []).every((i) => !i.done)).toBe(true))
  test('a GitHub remote and a push that worked', () => {
    expect(done(githubGuide(full, [push()]))).toEqual({ repo: true, gitignore: true, readme: true, remote: true, pushed: true })
  })
  test('a failed push is not pushed', () => expect(done(githubGuide(full, [push('failed')])).pushed).toBe(false))
  test('a GitLab remote is not a GitHub remote, and says why', () => {
    const remote = githubGuide({ ...full, remote: { host: 'gitlab.com', owner: 'o', name: 'r' } }, []).find((i) => i.id === 'remote')!
    expect(remote.done).toBe(false)
    expect(remote.why).toMatch(/GitHub/)
  })
  test('a .gitignore that misses secrets is not done', () => {
    expect(done(githubGuide({ ...full, ignoresSecrets: false }, [])).gitignore).toBe(false)
  })
  test('git init and a README written in the session count', () => {
    const steps = [
      { category: 'git' as const, status: 'ok' as const, toolName: 'Bash', input: { command: 'git init' } },
      { category: 'create' as const, status: 'ok' as const, toolName: 'Write', input: { file_path: '/p/README.md', content: '# x' } },
    ]
    expect(done(githubGuide(none, steps))).toMatchObject({ repo: true, readme: true })
  })
})

describe('githubAsk', () => {
  test('names every missing piece and asks for a private repository', () => {
    const ask = githubAsk(githubGuide(none, []))!
    expect(ask).toMatch(/git repository/)
    expect(ask).toMatch(/\.gitignore/)
    expect(ask).toMatch(/\.env/)
    expect(ask).toMatch(/README/)
    expect(ask).toMatch(/private GitHub repository/)
    expect(ask).toMatch(/push/)
  })
  test('only what is missing', () => {
    const ask = githubAsk(githubGuide({ ...full, readme: false }, [push()]))!
    expect(ask).toMatch(/README/)
    expect(ask).not.toMatch(/\.gitignore/)
  })
  test('nothing to ask when all is done', () => expect(githubAsk(githubGuide(full, [push()]))).toBeNull())
})

test('copy is plain', () => {
  for (const text of [...githubGuide(none, []).flatMap((i) => [i.title, i.why]), ...GUIDANCE, githubAsk(githubGuide(none, []))!]) {
    expect(text).not.toMatch(/—/)
    expect(text).not.toMatch(EMOJI)
  }
})

describe('review fixes', () => {
  const ok = (command: string) => ({ category: 'git' as const, status: 'ok' as const, toolName: 'Bash', input: { command } })
  test('writing .gitignore in the session counts', () => {
    const steps = [{ category: 'create' as const, status: 'ok' as const, toolName: 'Write', input: { file_path: '/p/.gitignore', content: '.env*' } }]
    expect(done(githubGuide(none, steps)).gitignore).toBe(true)
  })
  test('git remote add to GitHub counts as a GitHub repository', () => {
    expect(done(githubGuide(none, [ok('git remote add origin git@github.com:o/r.git')])).remote).toBe(true)
    expect(done(githubGuide(none, [ok('git remote add origin https://gitlab.com/o/r.git')])).remote).toBe(false)
  })
})
