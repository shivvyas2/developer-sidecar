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

  test('a failed change with no checks also names the step', () => {
    const bad = write('app/page.tsx', 'failed')
    expect(buildRecap([prompt('x'), bad], { cwd: '/p' })).toMatchObject({ checks: 'none', failingId: bad.id, built: [{ name: 'Home page', failed: true }] })
  })

  describe('the open-your-app address', () => {
    const run = (status: RecapStep['status'], output?: unknown) => step('Bash', 'run', { command: 'npm run dev' }, status, output)
    test('a dev server that started, or one polled in the background', () => {
      expect(buildRecap([prompt('x'), run('ok', NEXT_DEV)])!.url).toBe('http://localhost:3000')
      const bg = [prompt('x'), run('ok', 'Command running in background with ID: b1'), step('BashOutput', 'fallback', { bash_id: 'b1' }, 'ok', VITE)]
      expect(buildRecap(bg)!.url).toBe('http://localhost:5173')
    })
    test('carried across turns while the server keeps running', () => {
      expect(buildRecap([prompt('a'), run('ok', NEXT_DEV), prompt('b'), write('a.ts')])!.url).toBe('http://localhost:3000')
    })
    test('gone once the server was stopped, cut short or failed', () => {
      expect(buildRecap([prompt('x'), run('ok', NEXT_DEV), step('KillShell', 'fallback', { shell_id: 'b1' })])!.url).toBeUndefined()
      expect(buildRecap([prompt('x'), run('ok', NEXT_DEV), run('interrupted')])!.url).toBeUndefined()
      expect(buildRecap([prompt('x'), run('failed', NEXT_DEV)])!.url).toBeUndefined()
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
