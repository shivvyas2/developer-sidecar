import { describe, expect, test } from 'vitest'
import { formatElapsed, formatTokens, stepSubject, stepTitle } from '../src/format'

test('formatTokens', () => {
  expect([0, 950, 1234, 12_345, 3_400_000].map(formatTokens)).toEqual(['0', '950', '1.2k', '12k', '3.4M'])
})

describe('stepSubject', () => {
  test('commands drop the Bash prefix', () => {
    expect(stepSubject('Bash: npm install stripe')).toBe('npm install stripe')
  })
  test('file tools keep the basename', () => {
    expect(stepSubject('Write /tmp/demo/app/api/checkout/route.ts')).toBe('route.ts')
    expect(stepSubject('Read src/layout.tsx')).toBe('layout.tsx')
  })
  test('urls and queries keep the argument', () => {
    expect(stepSubject('WebSearch stripe checkout docs')).toBe('stripe checkout docs')
  })
  test('a bare tool name stays as is, prompts have no subject', () => {
    expect(stepSubject('TodoWrite')).toBe('TodoWrite')
    expect(stepSubject('UserPromptSubmit')).toBe('')
  })
  test('caps at 32 characters with an ellipsis', () => {
    const s = stepSubject(`Bash: ${'x'.repeat(80)}`)
    expect(s.length).toBe(32)
    expect(s.endsWith('…')).toBe(true)
  })
})

describe('stepTitle', () => {
  test('CATEGORY · subject', () => {
    expect(stepTitle({ category: 'install', techLabel: 'Bash: npm install stripe' })).toBe('INSTALL · npm install stripe')
    expect(stepTitle({ category: 'create', techLabel: 'Write /a/checkout.ts' })).toBe('NEW FILE · checkout.ts')
  })
  test('no subject leaves the category alone', () => {
    expect(stepTitle({ category: 'prompt', techLabel: 'UserPromptSubmit' })).toBe('PROMPT')
  })
})

describe('formatElapsed', () => {
  test('mm:ss, clamped at zero, minutes grow past 99', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_400)).toBe('01:05')
    expect(formatElapsed(-5)).toBe('00:00')
    expect(formatElapsed(100 * 60_000)).toBe('100:00')
  })
})
