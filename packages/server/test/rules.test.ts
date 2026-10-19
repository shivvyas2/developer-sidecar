import { describe, expect, test } from 'vitest'
import { SceneSpecSchema, type Step } from '@sidecar/shared'
import { render } from '@sidecar/ui-kit'
import { RULE_IDS, detectVendor, segments, translate } from '../src/rules'

const step = (toolName: string, input: unknown, over: Partial<Step> = {}): Step =>
  ({ id: 'x', sessionId: 's', toolName, input, startedAt: 0, status: 'ok', ...over })
const bash = (command: string) => step('Bash', { command })

describe('translate', () => {
  test.each<[string, Step, string, RegExp]>([
    ['prompt', step('UserPrompt', { prompt: 'build a todo app' }), 'prompt', /You asked: “build a todo app”/],
    ['subagent', step('Task', { description: 'research auth' }), 'subagent', /helper.*research auth/i],
    ['mcp tool', step('mcp__github__create_issue', {}), 'mcp', /github/i],
    ['mcp config', step('Write', { file_path: '/p/.mcp.json', content: '{}' }), 'mcp', /new tool/i],
    ['mcp add', bash('claude mcp add linear https://mcp.linear.app'), 'mcp', /new tool/i],
    ['git', bash('git commit -m "init"'), 'git', /checkpoint/i],
    ['install', bash('npm install stripe zod'), 'install', /stripe, zod/],
    ['install pip', bash('pip install requests'), 'install', /requests/],
    ['test', bash('pnpm vitest run'), 'test', /checking/i],
    ['deploy', bash('vercel --prod'), 'deploy', /live/i],
    ['run', bash('npm run dev'), 'run', /starting/i],
    ['data', step('Write', { file_path: '/p/prisma/schema.prisma', content: '' }), 'data', /data is stored/i],
    ['data migration', bash('npx prisma migrate dev'), 'data', /data is stored/i],
    ['external fetch', step('WebFetch', { url: 'https://docs.stripe.com/api' }), 'external', /Stripe/],
    ['external env', step('Edit', { file_path: '/p/.env.local', old_string: '', new_string: '' }), 'external', /secret settings/i],
    ['read', step('Read', { file_path: '/p/src/app.ts' }), 'read', /app\.ts/],
    ['grep', step('Grep', { pattern: 'TODO' }), 'read', /searching/i],
    ['create', step('Write', { file_path: '/p/src/api/users.ts', content: '' }), 'create', /users\.ts/],
    ['edit', step('Edit', { file_path: '/p/src/auth.ts' }), 'edit', /auth\.ts/],
    ['look ls', bash('ls -la'), 'read', /looking around/i],
    ['look cat test file', bash('cat src/app.test.ts'), 'read', /looking around/i],
    ['look grep for vitest', bash('grep -rn vitest package.json'), 'read', /looking around/i],
    ['look find', bash('find . -name "*.ts"'), 'read', /looking around/i],
    ['look git status', bash('git status'), 'read', /what has changed/i],
    ['look git diff', bash('git diff --stat'), 'read', /what has changed/i],
    ['not looking: redirect', bash('cat > notes.txt'), 'fallback', /running a command/i],
    ['not looking: pipe', bash('ls | xargs rm'), 'fallback', /running a command/i],
    ['not looking: chained', bash('ls && rm -rf dist'), 'fallback', /running a command/i],
    ['not looking: find -delete', bash('find . -name "*.log" -delete'), 'fallback', /running a command/i],
    ['not looking: find -exec', bash('find . -exec rm {} +'), 'fallback', /running a command/i],
    ['not looking: substitution', bash('cat $(curl -s https://x.example)'), 'fallback', /running a command/i],
    // not a quick look, so it is explained; the commit is the part that names the step
    ['not looking: multi-line', bash('ls src\nrm -rf dist\ngit commit -m wip'), 'git', /checkpoint/i],
    ['not looking: find -fprintf', bash("find . -name '*.log' -fprintf /tmp/list.txt '%p'"), 'fallback', /running a command/i],
    ['not looking: find -fls', bash('find . -fls /tmp/list.txt'), 'fallback', /running a command/i],
    ['not looking: find -okdir', bash('find . -okdir rm {} ;'), 'fallback', /running a command/i],
    ['not looking: git diff --output', bash('git diff --output=changes.patch'), 'fallback', /running a command/i],
    ['not looking: tree -o', bash('tree -o out.txt'), 'fallback', /running a command/i],
    ['not looking: tail -f', bash('tail -f server.log'), 'fallback', /running a command/i],
    ['not looking: tail -n 20 -F', bash('tail -n 20 -F server.log'), 'fallback', /running a command/i],
    ['look grep -o', bash('grep -o "TODO" src/app.ts'), 'read', /looking around/i],
    ['look tail -n', bash('tail -n 20 server.log'), 'read', /looking around/i],
    ['not looking: cat .env is about secrets', bash('cat .env'), 'external', /secret settings/i],
    ['not looking: cat .env.local', bash('cat ./.env.local'), 'external', /secret settings/i],
    ['not looking: head of an env file in a folder', bash('head -5 apps/web/.env.production'), 'external', /secret settings/i],
    ['look: a file merely named like env', bash('cat src/env.ts'), 'read', /looking around/i],
    ['git branch stays git', bash('git branch -D old'), 'git', /checkpoint/i],
    ['bash fallback', bash('mkdir -p src/lib'), 'fallback', /running a command/i],
    ['chained: add then commit', bash('git add -A && git commit -m "Add Stripe checkout"'), 'git', /checkpoint of your code/i],
    ['chained: commit then push', bash('git add . && git commit -m "wip" && git push'), 'git', /sending it to GitHub/i],
    ['chained: heredoc commit', bash(`git add -A && git commit -m "$(cat <<'EOF'\nRun the tests and deploy\nEOF\n)"`), 'git', /checkpoint of your code/i],
    ['chained: cd then install', bash('cd app && npm install stripe'), 'install', /: stripe$/],
    ['chained: install then test keeps the packages clean', bash('npm install stripe && npm test'), 'install', /: stripe$/],
    ['chained: build then deploy', bash('npm run build && vercel deploy --prod'), 'deploy', /live/i],
    ['chained: test piped to tail', bash('npx vitest run 2>&1 | tail -20'), 'test', /checking/i],
    ['chained: env then test', bash('cd web && CI=1 pnpm test'), 'test', /checking/i],
    ['subshell build', bash('(cd web && npm run build)'), 'run', /packaging/i],
    ['commit message words never count', bash('git commit -m "fix test, npm install, deploy to vercel"'), 'git', /checkpoint of your code/i],
    ['commit message saying push is not a push', bash('git commit -m "push the button"'), 'git', /checkpoint of your code/i],
    ['echo of a command is not the command', bash('echo "npm test"'), 'fallback', /running a command/i],
    ['a folder named test is not a test run', bash('mkdir test'), 'fallback', /running a command/i],
    ['shell test builtin is not a test run', bash('test -f package.json'), 'fallback', /running a command/i],
    ['a folder named vercel is not a deploy', bash('cd vercel-app && ls'), 'fallback', /running a command/i],
    ['make test', bash('make test'), 'test', /checking/i],
    ['pytest via python', bash('python3 -m pytest -q'), 'test', /checking/i],
    ['pip via python', bash('python3 -m pip install requests'), 'install', /requests/],
    ['quoted package spec', bash('pip install "django>=4"'), 'install', /: django>=4$/],
    ['pinned versions are package names, assignments are not', bash('pip install django==4.2 X=1'), 'install', /: django==4\.2$/],
    ['quoted scoped package', bash("npm i '@scope/pkg' zod"), 'install', /: @scope\/pkg, zod$/],
    ['installing a test browser is not a test run', bash('npx playwright install chromium'), 'fallback', /running a command/i],
    ['a typecheck with a test config is not a test run', bash('npx tsc -p tsconfig.test.json'), 'fallback', /running a command/i],
    ['linting a test folder is not a test run', bash('npx eslint src/test'), 'fallback', /running a command/i],
    ['a script that mentions jest is not a test run', bash('node scripts/clean-jest-cache.js'), 'run', /starting/i],
    ['npm run test:unit', bash('npm run test:unit'), 'test', /checking/i],
    ['yarn test', bash('yarn test --watch=false'), 'test', /checking/i],
    ['pnpm exec vitest', bash('pnpm exec vitest run'), 'test', /checking/i],
    ['pnpm dlx jest', bash('pnpm dlx jest'), 'test', /checking/i],
    ['npx playwright test', bash('npx playwright test --project=chromium'), 'test', /checking/i],
    ['cypress run', bash('npx cypress run'), 'test', /checking/i],
    ['bare pytest', bash('pytest -q tests/'), 'test', /checking/i],
    ['uv run pytest', bash('uv run pytest'), 'test', /checking/i],
    ['poetry run pytest', bash('poetry run pytest -x'), 'test', /checking/i],
    ['cargo test', bash('cargo test'), 'test', /checking/i],
    ['go test', bash('go test ./...'), 'test', /checking/i],
    ['deno test', bash('deno test'), 'test', /checking/i],
    ['bun test', bash('bun test'), 'test', /checking/i],
    ['build caption only from the run part', bash('npm run dev -- --name build-tools'), 'run', /starting/i],
    ['unknown tool', step('SomethingNew', {}), 'fallback', /working/i],
  ])('%s', (_n, s, category, caption) => {
    const t = translate(s)
    expect(t.category).toBe(category)
    expect(t.caption).toMatch(caption)
    expect(t.scene.caption).toBe(t.caption)
    expect(SceneSpecSchema.safeParse(t.scene).success).toBe(true)
    expect(render(t.scene, 1e9)).toMatch(/^<svg[\s\S]*<\/svg>$/)
  })

  test('every rule id has at least one case above', () => {
    expect(new Set(RULE_IDS)).toEqual(new Set([
      'prompt', 'subagent', 'mcp', 'git', 'install', 'test', 'deploy', 'run', 'data', 'external', 'read', 'create', 'edit', 'fallback',
    ]))
  })

  test('techLabel shows the raw command or tool + path', () => {
    expect(translate(bash('npm install stripe')).techLabel).toBe('Bash: npm install stripe')
    expect(translate(step('Edit', { file_path: '/p/a.ts' })).techLabel).toBe('Edit /p/a.ts')
  })

  test('long prompts are shortened in the caption', () => {
    const t = translate(step('UserPrompt', { prompt: 'x'.repeat(300) }))
    expect(t.caption.length).toBeLessThan(140)
  })

  test('malformed input never throws', () => {
    expect(() => translate(step('Bash', null))).not.toThrow()
    expect(() => translate(step('Edit', 'weird'))).not.toThrow()
  })

  test('test captions use plain punctuation, no em dashes', () => {
    expect(translate({ ...bash('npm test'), status: 'failed' }).caption).toBe('Checking the code works: some checks failed')
    expect(translate(bash('npm test')).caption).toBe('Checking the code works: all good')
  })

  test('failed tests get an error effect', () => {
    const t = translate({ ...bash('npm test'), status: 'failed' })
    expect(JSON.stringify(t.scene.beats)).toContain('"error"')
  })
})

describe('detectVendor', () => {
  test.each([
    ['npm install stripe', 'Stripe'], ['https://api.openai.com/v1', 'OpenAI'],
    ['@anthropic-ai/sdk', 'Anthropic'], ['supabase.co', 'Supabase'], ['ls', undefined],
  ])('%s → %s', (text, vendor) => {
    expect(detectVendor(text)).toBe(vendor)
  })
})

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
    expect(segments('echo "" && npm test', { raw: true })).toEqual(['echo', 'npm test'])
  })

  test('unbalanced quotes and empty input never throw', () => {
    expect(segments('')).toEqual([])
    expect(segments('  &&  ;; ')).toEqual([])
    expect(segments('echo "never closed && npm test')).toEqual(['echo "'])
  })
})
