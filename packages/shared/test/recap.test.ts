import { describe, expect, test } from 'vitest'
import { buildRecap, localUrl, type RecapStep } from '../src/recap'

let n = 0
const step = (toolName: string, category: RecapStep['category'], input: Record<string, unknown> = {}, status: RecapStep['status'] = 'ok', output?: unknown): RecapStep =>
  ({ id: `t${++n}`, toolName, category, status, input, ...(output !== undefined ? { output } : {}) })
const prompt = (text: string) => step('UserPrompt', 'prompt', { prompt: text })
const write = (path: string, status: RecapStep['status'] = 'ok') => step('Write', 'create', { file_path: `/p/${path}`, content: '' }, status)
const check = (status: RecapStep['status'] = 'ok') => step('Bash', 'test', { command: 'npm test' }, status)
const NEXT_DEV = { stdout: '> shop@0.1.0 dev\n> next dev\n\n   ▲ Next.js 16.1.0\n   - Local:        http://localhost:3000\n   - Network:      http://192.168.1.20:3000\n\n ✓ Ready in 1.2s', stderr: '' }
const VITE = '\n  VITE v7.1.0  ready in 300 ms\n\n  ➜  Local:   http://127.0.0.1:5173/\n  ➜  Network: use --host to expose\n'

describe('localUrl', () => {
  test.each<[unknown, string | undefined]>([
    [NEXT_DEV, 'http://localhost:3000'],
    [VITE, 'http://localhost:5173'],
    ['Serving on http://0.0.0.0:8000/app.', 'http://localhost:8000/app'],
    ['listening at http://[::1]:4321/docs', 'http://localhost:4321/docs'],
    ['see https://evil.com:3000 and http://example.com', undefined],
    ['http://localhost:99999', undefined],
    ['http://localhost.evil.com:3000', undefined],
    [undefined, undefined],
    [{ deep: { stdout: 'http://localhost:8080' } }, 'http://localhost:8080'],
    // an https dev server (next dev --experimental-https, Vite with server.https) only answers https
    ['  - Local:        https://localhost:3000', 'https://localhost:3000'],
    ['  ➜  Local:   https://127.0.0.1:5173/', 'https://localhost:5173'],
  ])('%j', (output, want) => expect(localUrl(output)).toBe(want))
})

describe('buildRecap', () => {
  test('a session with no steps has no recap', () => expect(buildRecap([])).toBeNull())

  test('says what you asked and what got built, with packages counted', () => {
    const p = prompt('Add checkout')
    const r = buildRecap([
      prompt('older'), write('app/old/page.tsx'),
      p, step('Read', 'read', { file_path: '/p/app/layout.tsx' }), write('app/api/checkout/route.ts'), write('app/success/page.tsx'),
      step('Bash', 'install', { command: 'npm install stripe zod' }), check(),
    ], { cwd: '/p', attention: 'done' })!
    expect(r).toMatchObject({ turnId: p.id, asked: 'Add checkout', state: 'done', outcome: 'good', checks: 'pass', fixes: 0, packages: 2 })
    // only this turn's changes; what Claude only read and the older turn are left out
    expect(r.built.map((b) => b.name)).toEqual(['Success page', 'Checkout', 'Stripe'])
  })

  test('each part carries its map id, which stays unique when two parts share a name', () => {
    const r = buildRecap([prompt('x'), write('lib/utils.ts'), write('src/utils.ts')], { cwd: '/p' })!
    expect(r.built).toEqual([
      { id: 'code:lib/utils.ts', kind: 'code', name: 'Utils', failed: false },
      { id: 'code:src/utils.ts', kind: 'code', name: 'Utils', failed: false },
    ])
  })

  test('a turn changed something when a create, edit or install finished, even on files the map leaves out', () => {
    const edit = (path: string, status: RecapStep['status'] = 'ok') => step('Edit', 'edit', { file_path: `/p/${path}`, old_string: 'a', new_string: 'b' }, status)
    const r = buildRecap([prompt('Tidy the readme'), edit('README.md'), edit('package.json')], { cwd: '/p' })!
    expect(r).toMatchObject({ built: [], packages: 0, changed: true })
    expect(buildRecap([prompt('x'), step('Bash', 'install', { command: 'npm install' })])!.changed).toBe(true)
    expect(buildRecap([prompt('x'), step('NotebookEdit', 'edit', { notebook_path: '/p/a.ipynb' })])!.changed).toBe(true)
    // reads, checks and a change that failed or was cut short changed nothing
    expect(buildRecap([prompt('x'), step('Read', 'read', { file_path: '/p/README.md' }), check(), edit('README.md', 'failed'), edit('a.md', 'interrupted')])!.changed).toBe(false)
  })

  test('a turn with no prompt is keyed by its first step, the same id the story and the server use', () => {
    const first = write('a.ts')
    expect(buildRecap([first, check()])!.turnId).toBe(first.id)
  })

  test('working while Claude works, you while it waits for permission', () => {
    expect(buildRecap([prompt('x'), write('a.ts')], { attention: 'working' })).toMatchObject({ state: 'working', outcome: 'working' })
    expect(buildRecap([prompt('x'), write('a.ts')], { attention: 'permission' })!.state).toBe('you')
  })

  test('a failing check names the step to ask about; a later fix clears it', () => {
    const fail = check('failed')
    expect(buildRecap([prompt('x'), write('a.ts'), fail])).toMatchObject({ checks: 'fail', outcome: 'failing', failingId: fail.id })
    const fixed = buildRecap([prompt('x'), fail, write('a.ts'), check()])!
    expect(fixed).toMatchObject({ checks: 'pass', outcome: 'fixed', fixes: 1 })
    expect(fixed.failingId).toBeUndefined()
  })

  test('a turn that ran no checks reads the session\'s last ones, as the status light does', () => {
    expect(buildRecap([prompt('a'), check('failed'), prompt('b'), write('README.md')])!.checks).toBe('fail')
    expect(buildRecap([prompt('a'), check(), prompt('b'), write('README.md')])!.checks).toBe('pass')
    expect(buildRecap([prompt('a'), write('a.ts'), prompt('b'), write('README.md')])!.checks).toBe('none')
  })

  test('a check run that was cut short is not a run', () => {
    const stopped = step('Bash', 'test', { command: 'npm test' }, 'failed', { stdout: '', interrupted: true })
    expect(buildRecap([prompt('a'), check(), prompt('b'), check('interrupted')])!.checks).toBe('pass')
    expect(buildRecap([prompt('a'), check(), prompt('b'), stopped])!.checks).toBe('pass')
    expect(buildRecap([prompt('a'), check(), { ...stopped, id: 'stopped2' }])!.checks).toBe('pass')
  })

  test('the step to ask about is never one that was only stopped', () => {
    const bad = write('app/page.tsx', 'failed')
    const stopped = step('Bash', 'run', { command: 'npm run dev' }, 'failed', { stdout: '', interrupted: true })
    expect(buildRecap([prompt('x'), bad, stopped], { cwd: '/p' })).toMatchObject({ outcome: 'failing', failingId: bad.id })
  })

  test('a failed change with no checks also names the step', () => {
    const bad = write('app/page.tsx', 'failed')
    expect(buildRecap([prompt('x'), bad], { cwd: '/p' })).toMatchObject({ checks: 'none', failingId: bad.id, built: [{ name: 'Home page', failed: true }] })
  })

  describe('the open-your-app address', () => {
    const run = (status: RecapStep['status'], output?: unknown, command = 'npm run dev') => step('Bash', 'run', { command }, status, output)
    const background = (id: string) => [run('ok', `Command running in background with ID: ${id}`), step('BashOutput', 'fallback', { bash_id: id }, 'ok', VITE)]
    test('a dev server that started, or one polled in the background', () => {
      expect(buildRecap([prompt('x'), run('ok', NEXT_DEV)])!.url).toBe('http://localhost:3000')
      expect(buildRecap([prompt('x'), ...background('b1')])!.url).toBe('http://localhost:5173')
    })
    test('carried across turns while the server keeps running', () => {
      expect(buildRecap([prompt('a'), run('ok', NEXT_DEV), prompt('b'), write('a.ts')])!.url).toBe('http://localhost:3000')
    })
    test('gone once the server was stopped, cut short or failed', () => {
      expect(buildRecap([prompt('x'), ...background('b1'), step('KillShell', 'fallback', { shell_id: 'b1' })])!.url).toBeUndefined()
      expect(buildRecap([prompt('x'), run('ok', NEXT_DEV), run('interrupted')])!.url).toBeUndefined()
      expect(buildRecap([prompt('x'), run('failed', NEXT_DEV)])!.url).toBeUndefined()
      expect(buildRecap([prompt('x'), run('ok', NEXT_DEV), run('failed', undefined, 'npx next dev')])!.url).toBeUndefined()
    })
    test('a server started by some other command is gone once that same command fails', () => {
      const node = (status: RecapStep['status'], output?: unknown) => run(status, output, 'node server.js')
      expect(buildRecap([prompt('x'), node('ok', 'listening on http://localhost:8080'), node('failed')])!.url).toBeUndefined()
    })
    test('another command failing leaves the server up', () => {
      // turn 2's build fails on a type error while the dev server from turn 1 still serves
      expect(buildRecap([prompt('a'), run('ok', NEXT_DEV), prompt('b'), run('failed', 'Type error', 'npm run build')])!.url).toBe('http://localhost:3000')
      expect(buildRecap([prompt('a'), run('ok', NEXT_DEV), run('interrupted', undefined, 'node scripts/seed.js')])!.url).toBe('http://localhost:3000')
    })
    test('stopping an unrelated background command leaves the server up', () => {
      expect(buildRecap([prompt('x'), ...background('b1'), step('KillShell', 'fallback', { shell_id: 'b2' })])!.url).toBe('http://localhost:5173')
      expect(buildRecap([prompt('x'), ...background('b1'), step('KillBash', 'fallback', { shell_id: 'b1' })])!.url).toBeUndefined()
    })
    test('the shell id also comes from the background task id Claude Code returns', () => {
      const started = run('ok', { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bash_7' })
      const polled = step('BashOutput', 'fallback', { bash_id: 'bash_7' }, 'ok', { stdout: NEXT_DEV.stdout })
      expect(buildRecap([prompt('x'), started, polled])!.url).toBe('http://localhost:3000')
      expect(buildRecap([prompt('x'), started, polled, step('KillShell', 'fallback', { shell_id: 'bash_7' })])!.url).toBeUndefined()
    })
    test('the newer TaskOutput and TaskStop tools read and stop a background server too', () => {
      const polled = [run('ok', 'Command running in background with ID: t1'), step('TaskOutput', 'fallback', { task_id: 't1' }, 'ok', VITE)]
      expect(buildRecap([prompt('x'), ...polled])!.url).toBe('http://localhost:5173')
      expect(buildRecap([prompt('x'), ...polled, step('TaskStop', 'fallback', { task_id: 't2' })])!.url).toBe('http://localhost:5173')
      expect(buildRecap([prompt('x'), ...polled, step('TaskStop', 'fallback', { task_id: 't1' })])!.url).toBeUndefined()
    })
    test('an address in some other step never becomes a button', () => {
      expect(buildRecap([prompt('x'), step('Bash', 'fallback', { command: 'curl -s localhost' }, 'ok', 'http://localhost:9999')])!.url).toBeUndefined()
    })
  })
})

describe('AiRecapSchema', () => {
  test('takes a summary and meaning, with next only when given', async () => {
    const { AiRecapSchema } = await import('../src/recap')
    expect(AiRecapSchema.safeParse({ summary: 'Added checkout.', meaning: 'People can pay.' }).success).toBe(true)
    expect(AiRecapSchema.safeParse({ summary: 'x', meaning: 'y', next: 'Fix the test' }).success).toBe(true)
    expect(AiRecapSchema.safeParse({ summary: '', meaning: 'y' }).success).toBe(false)
    expect(AiRecapSchema.safeParse({ summary: 'x'.repeat(601), meaning: 'y' }).success).toBe(false)
  })
})
