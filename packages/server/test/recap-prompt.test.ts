import { describe, expect, test } from 'vitest'
import type { FeedStep, RuleRecap } from '@sidecar/shared'
import { translate } from '../src/rules'
import { encodeTurn, normalizeRecap, RECAP_CAPS, RECAP_SYSTEM_PROMPT, RecapOutputSchema, type RecapOutput } from '../src/explainer/recap-prompt'

let n = 0
const step = (toolName: string, input: Record<string, unknown>, status: FeedStep['status'] = 'ok', output?: unknown): FeedStep => {
  const s = { id: `toolu_${String(++n).padStart(4, '0')}`, sessionId: 's1', toolName, input, startedAt: n, status, ...(output !== undefined ? { output } : {}) }
  return { ...s, ...translate(s), seq: n }
}
const read = (p: string) => step('Read', { file_path: `/p/${p}` }, 'ok', { file: { content: 'SECRET FILE BODY' } })
const write = (p: string, content = 'export const x = 1') => step('Write', { file_path: `/p/${p}`, content })
const edit = (p: string) => step('Edit', { file_path: `/p/${p}`, old_string: 'a', new_string: 'b' }, 'ok', { originalFile: 'WHOLE ORIGINAL FILE' })
const bash = (command: string, status: FeedStep['status'] = 'ok', output?: unknown) => step('Bash', { command }, status, output)
const rule: RuleRecap = { turnId: 'p', asked: 'Add checkout', state: 'done', outcome: 'good', built: [{ kind: 'backend', name: 'Checkout', failed: false }], packages: 1, checks: 'pass', fixes: 0 }
const ctx = { project: 'shop', asked: 'Add checkout', rule, cwd: '/p' }

describe('encodeTurn', () => {
  test('a turn becomes a few plain lines: reads folded, repeat edits counted, no file bodies or originals', () => {
    const { user, labels } = encodeTurn(ctx, [
      read('app/page.tsx'), read('lib/a.ts'), step('Grep', { pattern: 'x' }),
      bash('npm install stripe'), write('app/api/checkout/route.ts', 'BODY OF THE NEW FILE'),
      edit('app/page.tsx'), edit('app/page.tsx'), edit('app/page.tsx'),
      bash('npx vitest run', 'failed', { stdout: 'x'.repeat(5000) + ' FAIL checkout.test.ts expected 200 got 500', stderr: '' }),
      bash('npx vitest run', 'ok', { stdout: 'Tests 3 passed' }),
    ])
    expect(user).toContain('Project: shop\nAsked: "Add checkout"')
    expect(user).toContain('s1 installed stripe')
    expect(user).toContain('s2 wrote app/api/checkout/route.ts')
    expect(user).toContain('s3 changed app/page.tsx ×3')
    expect(user).toMatch(/s4 ran checks `npx vitest run` FAILED :: …x+ FAIL checkout\.test\.ts expected 200 got 500/)
    expect(user).toContain('s5 ran checks `npx vitest run`\n')
    expect(user).toContain('Also: looked at 2 files, searched 1 time')
    expect(user).toContain('Facts: built or changed Checkout; 1 packages added; checks pass')
    for (const never of ['SECRET FILE BODY', 'BODY OF THE NEW FILE', 'WHOLE ORIGINAL FILE', 'Tests 3 passed']) expect(user).not.toContain(never)
    expect(labels.size).toBe(5)
    expect([...labels.keys()]).toEqual(['s1', 's2', 's3', 's4', 's5'])
  })

  test('a 150-step turn stays inside the caps: 30 lines, every failure kept, the rest counted', () => {
    const steps = [...Array.from({ length: 140 }, (_, i) => write(`src/f${i}.ts`)), ...Array.from({ length: 10 }, (_, i) => bash(`npm run step${i}`, i === 4 ? 'failed' : 'ok', 'boom'))]
    const { user } = encodeTurn(ctx, steps)
    const stepLines = user.split('\n').filter((l) => /^s\d+ /.test(l))
    expect(stepLines.length).toBe(RECAP_CAPS.lines - 1)
    expect(user).toContain('npm run step4` FAILED :: boom')
    expect(user).toMatch(/…and \d+ more steps/)
    expect(user.length).toBeLessThanOrEqual(RECAP_CAPS.userChars)
  })

  test('a command you cancelled reads stopped, not failed, and an empty output adds nothing', () => {
    const { user } = encodeTurn(ctx, [bash('npm run dev', 'failed', { stdout: '', stderr: '', interrupted: true }), bash('npm test', 'failed', '')])
    expect(user).toContain('s1 ran `npm run dev` (stopped)\n')
    expect(user).toContain('s2 ran checks `npm test` FAILED\n')
    expect(user).not.toContain('::')
  })
  test('only the latest three failures carry output', () => {
    const steps = Array.from({ length: 5 }, (_, i) => bash(`npm test -- ${i}`, 'failed', `error number ${i}`))
    const { user } = encodeTurn(ctx, steps)
    expect(user).not.toContain('error number 0')
    expect(user).not.toContain('error number 1')
    for (const i of [2, 3, 4]) expect(user).toContain(`error number ${i}`)
  })

  test('secrets are scrubbed from commands, outputs and what you asked', () => {
    // a fake key, built at runtime so secret scanners don't take it for a real one
    const key = ['sk', 'live', '51Habcdefghijklmnopqrstuvwx'].join('_')
    const { user } = encodeTurn({ ...ctx, asked: `use ${key}` }, [
      bash(`curl -H "Authorization: Bearer ${key}" https://api.stripe.com`, 'failed', `key ${key} rejected`),
    ])
    expect(user).not.toContain(key.slice(0, 16))
  })

  test('a key cut in half by the output tail or the command clip is still scrubbed', () => {
    // fake keys, built at runtime so secret scanners don't take them for real ones
    const stripe = ['sk', 'live', '51H' + 'Zq9Xw2Vb7Nm4Kp8Lr3Ts6Yu1Jh5Gf0Dc'].join('_')
    const anthropic = ['sk', 'ant', 'api03', 'Zq9Xw2Vb7Nm4Kp8Lr3Ts6'].join('-')
    // 380 chars after the key, so the 400-char tail starts inside it
    const output = { stdout: `key ${stripe} ${'y'.repeat(380)}`, stderr: '' }
    // the key starts at char 103, so the 120-char clip cuts it after 16 chars
    const cmd = `echo ${'a'.repeat(97)} ${anthropic} done`
    const { user } = encodeTurn({ ...ctx, asked: `${'b'.repeat(RECAP_CAPS.promptChars - 17)} ${stripe}` }, [bash('npm test', 'failed', output), bash(cmd)])
    expect(user).not.toContain(stripe.slice(-12))
    expect(user).not.toContain('api03-Zq9')
    expect(user).not.toContain('51HZq9')
  })

  test('a very long prompt is shortened, and an empty turn still encodes', () => {
    expect(encodeTurn({ ...ctx, asked: 'a'.repeat(1000) }, []).user).toContain(`Asked: "${'a'.repeat(RECAP_CAPS.promptChars - 1)}…"`)
    expect(encodeTurn({ ...ctx, asked: '' }, []).user).toContain('Steps:\n(none)')
  })

  test('the facts say when something still fails, and where the app runs', () => {
    const { user } = encodeTurn({ ...ctx, rule: { ...rule, checks: 'fail', outcome: 'failing', url: 'http://localhost:3000' } }, [])
    expect(user).toContain('checks still FAIL')
    expect(user).toContain('the app runs at http://localhost:3000')
  })
})

describe('normalizeRecap', () => {
  const labels = new Map([['s1', 'toolu_a'], ['s2', 'toolu_b']])
  const out = (over: Partial<RecapOutput> = {}): RecapOutput => ({
    summary: '  Added a   checkout page. ', meaning: 'People can pay.', next: 'Fix the checkout test',
    decisions: [{ step: 's2', title: 'Payments', choice: 'Stripe', alternatives: ['PayPal', '', 'Square', 'Adyen', 'Braintree'], reason: 'Hosted checkout' }],
    concepts: [{ step: 's1', term: 'Webhook', definition: 'A message a service sends your app.' }],
    ...over,
  })
  test('clips and maps labels back to step ids', () => {
    expect(normalizeRecap(out(), labels, true)).toEqual({
      ai: { summary: 'Added a checkout page.', meaning: 'People can pay.', next: 'Fix the checkout test' },
      decisions: [{ stepId: 'toolu_b', title: 'Payments', choice: 'Stripe', alternatives: ['PayPal', 'Square', 'Adyen'], reason: 'Hosted checkout' }],
      concepts: [{ stepId: 'toolu_a', term: 'Webhook', definition: 'A message a service sends your app.' }],
    })
  })
  test('next only while something fails', () => expect(normalizeRecap(out(), labels, false)!.ai.next).toBeUndefined())
  test('unknown or real-id labels are dropped, not guessed', () => {
    const r = normalizeRecap(out({ concepts: [{ step: 's9', term: 'X', definition: 'Y' }, { step: 'toolu_a', term: 'Z', definition: 'W' }] }), labels, false)!
    expect(r.concepts).toEqual([])
  })
  test('caps decisions and concepts, and drops empty ones', () => {
    const many = Array.from({ length: 6 }, () => ({ step: 's1', term: 'T', definition: 'D' }))
    const r = normalizeRecap(out({ concepts: [...many, { step: 's1', term: ' ', definition: 'D' }], decisions: [{ step: 's1', title: '', choice: 'c', alternatives: [], reason: 'r' }] }), labels, false)!
    expect(r.concepts).toHaveLength(3)
    expect(r.decisions).toEqual([])
  })
  test('an empty summary is no recap', () => expect(normalizeRecap(out({ summary: '  ' }), labels, false)).toBeNull())
  test('long text is clipped to fit the stored schema', () => {
    expect(normalizeRecap(out({ summary: 'w '.repeat(1000) }), labels, false)!.ai.summary.length).toBeLessThanOrEqual(600)
  })
})

test('the recap system prompt stays short (it goes with every request)', () => {
  expect(RECAP_SYSTEM_PROMPT.length).toBeLessThanOrEqual(1200)
})

test('the output schema accepts what the prompt asks for', () => {
  expect(RecapOutputSchema.safeParse({ summary: 's', meaning: 'm', next: null, decisions: [], concepts: [] }).success).toBe(true)
})
