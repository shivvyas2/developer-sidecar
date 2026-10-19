import { describe, expect, test } from 'vitest'
import { packagesIn, segments } from '../src/shell'

describe('segments', () => {
  test.each<[string, string[]]>([
    ['npm test', ['npm test']],
    ['git add -A && git commit -m "x"', ['git add -A', 'git commit -m " "']],
    ['a || b; c | d & e', ['a', 'b', 'c', 'd', 'e']],
    ['ls src\nrm -rf dist\r\ngit status', ['ls src', 'rm -rf dist', 'git status']],
    ['npm test 2>&1 | tail -20', ['npm test 2>&1', 'tail -20']],
    ['npm run dev &> log.txt', ['npm run dev &> log.txt']],
    ['cd app && NODE_ENV=test FOO=1 npm test', ['cd app', 'npm test']],
    ['sudo npm install -g pnpm', ['npm install -g pnpm']],
    [`MSG="a b" X='' npm test`, ['npm test']],
    ['(cd web && npm run build)', ['cd web', 'npm run build)']],
    ['npm install \\\n  stripe', ['npm install \\\n  stripe']],
  ])('%j', (cmd, want) => {
    expect(segments(cmd)).toEqual(want)
  })

  test('quoted text is blanked, separators inside quotes included', () => {
    const blank = (s: string) => ' '.repeat(s.length)
    expect(segments(`git commit -m "fix test && deploy to vercel"`)).toEqual([`git commit -m "${blank('fix test && deploy to vercel')}"`])
    expect(segments(`echo 'npm install x; rm -rf /'`)).toEqual([`echo '${blank('npm install x; rm -rf /')}'`])
    expect(segments('git commit -m "say \\"hi\\" && go"')).toHaveLength(1)
  })

  test('a heredoc commit message, the way Claude Code writes one, is one blank command', () => {
    const cmd = `git commit -m "$(cat <<'EOF'\nAdd tests; run vitest\n\nnpm install stripe\nEOF\n)"`
    const out = segments(cmd)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/^git commit -m "\s+"$/)
  })

  test('raw keeps the quoted text and drops the quotes, part for part', () => {
    expect(segments('cd a && pip install "django>=4" && git commit -m "x; y"', { raw: true })).toEqual(['cd a', 'pip install django>=4', 'git commit -m x; y'])
    expect(segments("sudo npm i '@s/p'", { raw: true })).toEqual(['npm i @s/p'])
    expect(segments(`FOO="a b" npm i '@s/p'`, { raw: true })).toEqual(['npm i @s/p'])
    expect(segments('echo "" && npm test', { raw: true })).toEqual(['echo', 'npm test'])
  })

  test('unbalanced quotes and empty input never throw', () => {
    expect(segments('')).toEqual([])
    expect(segments('  &&  ;; ')).toEqual([])
    expect(segments('echo "never closed && npm test')).toEqual(['echo "'])
  })
})

describe('packagesIn', () => {
  test.each<[string, string[]]>([
    ['npm install stripe zod', ['stripe', 'zod']],
    ['npm i -D vitest @types/node', ['vitest', '@types/node']],
    ['pnpm add react@19', ['react@19']],
    ['pip install requests==2.32', ['requests==2.32']],
    ['npm install stripe CI=1', ['stripe']],
    ['npm install', []],
    ['go get github.com/x/y', ['github.com/x/y']],
  ])('%s', (cmd, want) => {
    expect(packagesIn(cmd)).toEqual(want)
  })
})
