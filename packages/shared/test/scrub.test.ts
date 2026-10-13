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
