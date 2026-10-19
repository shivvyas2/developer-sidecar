import { describe, expect, test } from 'vitest'
import { REDACTED, limitSize, scrubDeep, scrubEvent, scrubText } from '@sidecar/shared'

describe('scrubText', () => {
  test.each([
    ['anthropic', 'key sk-ant-api03-abcdefghijklmnop123'],
    ['openai', 'export OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstu'],
    ['github', 'ghp_abcdefghijklmnopqrstuvwxyz0123'],
    ['github oauth', 'gho_abcdefghijklmnopqrstuvwxyz0123'],
    ['github pat', 'github_pat_11ABCDEFG0123456789_abcdefghijk'],
    ['aws', 'AKIAABCDEFGHIJKLMNOP'],
    ['slack', 'xoxb-1234567890-abcdefghij'],
    ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
  ])('redacts %s', (_name, input) => {
    const out = scrubText(input)
    expect(out).toContain(REDACTED)
    expect(out).not.toMatch(/sk-ant-api03-abc|sk-proj-abc|ghp_abc|gho_abc|github_pat_11|AKIAABCD|xoxb-123|dozjgNry/)
  })
  // Fake keys, built at runtime so secret scanners don't take them for real ones.
  const stripe = (...parts: string[]) => parts.join('_')
  test.each([
    ['a live secret key in output', `Invalid API key provided: ${stripe('sk', 'live', '51Habcdefghijklmnopqrstuvwx')}`],
    ['a test secret key in a header-less curl', `curl https://api.stripe.com/v1/charges -u ${stripe('sk', 'test', '51Pabcdefghijklmnop')}:`],
    ['a restricted key', stripe('rk', 'live', '51Habcdefghijklmnop')],
    ['a webhook signing secret', `stripe listen printed ${stripe('whsec', 'abcdefghijklmnop1234')}`],
  ])('redacts Stripe: %s', (_name, input) => {
    const out = scrubText(input)
    expect(out).toContain(REDACTED)
    expect(out).not.toMatch(/[sr]k_(live|test)_51|whsec_abc/)
  })
  test('leaves Stripe publishable keys and ids alone', () => {
    for (const s of ['pk_test_51Pabcdefghijklmnop', 'cus_Abcdefghijklmn', 'sk_live_short']) expect(scrubText(s)).toBe(s)
  })
  test('redacts PEM private keys', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----'
    expect(scrubText(`x ${pem} y`)).toBe(`x ${REDACTED} y`)
  })
  test('redacts Authorization and Cookie headers', () => {
    expect(scrubText('curl -H "Authorization: Bearer abc.def" https://x')).toBe(`curl -H "Authorization: ${REDACTED}" https://x`)
    expect(scrubText('Cookie: sid=123; other=4')).toBe(`Cookie: ${REDACTED}`)
  })
  test('redacts password= style pairs', () => {
    expect(scrubText('DATABASE password=hunter22 host=x')).toBe(`DATABASE password=${REDACTED} host=x`)
    expect(scrubText('api_key: "abc123xyz"')).toBe(`api_key: "${REDACTED}"`)
  })
  test('redacts extra secret values (from .env)', () => {
    expect(scrubText('connect to postgres://u:s3cretpw@db', ['s3cretpw'])).toBe(`connect to postgres://u:${REDACTED}@db`)
  })
  test('ignores extra values shorter than 6 chars', () => {
    expect(scrubText('true value', ['true'])).toBe('true value')
  })
  test('leaves normal text alone', () => {
    expect(scrubText('npm install stripe')).toBe('npm install stripe')
  })
})

describe('scrubDeep', () => {
  test('scrubs nested strings, keeps keys and non-strings', () => {
    expect(scrubDeep({ a: ['ghp_abcdefghijklmnopqrstuvwxyz0123', 1], b: { c: null } }))
      .toEqual({ a: [REDACTED, 1], b: { c: null } })
  })
})

describe('limitSize', () => {
  test('passes small values through', () => {
    expect(limitSize({ a: 'x' })).toEqual({ a: 'x' })
  })
  test('truncates long strings', () => {
    const out = limitSize({ content: 'a'.repeat(5000) }) as { content: string }
    expect(out.content.length).toBeLessThan(1100)
    expect(out.content).toContain('[truncated 4000 chars]')
  })
  test('keeps the end of a long string, where summaries and errors are', () => {
    const out = limitSize({ stdout: `${'noise\n'.repeat(1000)}Tests  1 failed | 5 passed (6)` }) as { stdout: string }
    expect(out.stdout).toMatch(/^noise/)
    expect(out.stdout).toMatch(/Tests {2}1 failed \| 5 passed \(6\)$/)
  })
  test('caps total JSON size at maxChars', () => {
    const big = Array.from({ length: 200 }, (_, i) => ({ i, s: 'x'.repeat(900) }))
    const out = limitSize(big)
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(4096)
    expect(out).toMatchObject({ truncated: true })
  })
})

describe('scrubEvent', () => {
  test('scrubs and limits tool input/output and prompt', () => {
    const e = scrubEvent({
      id: 'e', sessionId: 's', ts: 1, cwd: '/', kind: 'tool_end',
      tool: { name: 'Bash', input: { command: 'export K=sk-ant-api03-abcdefghijklmnop' }, output: 'z'.repeat(3000), ok: true },
      prompt: 'my key is ghp_abcdefghijklmnopqrstuvwxyz0123',
    })
    expect(JSON.stringify(e.tool?.input)).toContain(REDACTED)
    expect((e.tool?.output as string).length).toBeLessThan(1100)
    expect(e.prompt).toBe(`my key is ${REDACTED}`)
  })
})

describe('scrubText: env-var and credential forms', () => {
  test.each([
    ['prefixed password', 'export DB_PASSWORD=hunter2hunter2', 'hunter2hunter2'],
    ['quoted api key', 'export ANTHROPIC_API_KEY="abcdef123456789"', 'abcdef123456789'],
    ['secret key', 'export STRIPE_SECRET_KEY=rk_live_abcdef123456', 'rk_live_abcdef123456'],
    ['inline token', 'MY_TOKEN=tok_9f8e7d6c5b node app.js', 'tok_9f8e7d6c5b'],
    ['json auth header', '{"Authorization":"Bearer abc.def.ghi"}', 'abc.def.ghi'],
    ['url credentials', 'psql postgres://admin:pa55word@db.example.com/app', 'pa55word'],
    ['curl -u', 'curl -u alice:s3cretpass https://api.example.com', 's3cretpass'],
  ])('redacts %s', (_n, input, secret) => {
    const out = scrubText(input)
    expect(out).not.toContain(secret)
    expect(out).toContain(REDACTED)
  })
  test('keeps the variable name and command readable', () => {
    expect(scrubText('MY_TOKEN=tok_9f8e7d6c5b node app.js')).toBe(`MY_TOKEN=${REDACTED} node app.js`)
    expect(scrubText('psql postgres://admin:pa55word@db/app')).toBe(`psql postgres://admin:${REDACTED}@db/app`)
  })
})

describe('scrubEvent: prompt size', () => {
  test('very long prompts are truncated, not dropped', () => {
    const e = scrubEvent({ id: 'e', sessionId: 's', ts: 1, cwd: '/', kind: 'prompt', prompt: 'p'.repeat(300 * 1024) })
    expect(e.prompt!.length).toBeLessThanOrEqual(4200)
    expect(e.prompt).toContain('[truncated')
  })
})
