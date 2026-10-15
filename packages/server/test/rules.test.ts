import { describe, expect, test } from 'vitest'
import { SceneSpecSchema, type Step } from '@sidecar/shared'
import { render } from '@sidecar/ui-kit'
import { RULE_IDS, detectVendor, translate } from '../src/rules'

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
    ['bash fallback', bash('ls -la'), 'fallback', /running a command/i],
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
