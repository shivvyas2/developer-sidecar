import { describe, expect, test } from 'vitest'
import type { ExplainerState, FeedStep } from '@sidecar/shared'
import { bandLine, basename, emptyState, explainerPrint, plain, stepsPrint, width, readoutOf, statusLine, textModel, workstationUrl, type ModState } from '../src/mod/model'

const step = (n: number, over: Partial<FeedStep> = {}): FeedStep => ({
  id: `s${n}`, sessionId: 'S1', seq: n, toolName: 'Bash', input: {}, startedAt: 1_000 + n * 1_000, status: 'ok',
  category: 'install', caption: `Installing thing ${n}`, techLabel: 'Bash: pnpm add stripe',
  scene: { scene: 'install-package', cast: ['claude'], beats: [], caption: `Installing thing ${n}` },
  ...over,
} as FeedStep)
const explainer = (input: number, output: number): ExplainerState => ({ level: 'haiku', provider: 'api', status: 'ready', tokens: { input, output } })
const state = (over: Partial<ModState> = {}): ModState => ({ ...emptyState(), project: 'shop', ...over })

describe('plain', () => {
  test('strips terminal controls and bidi marks', () => {
    expect(plain('a\u001b[31mb\u0007c\u202ed\ne')).toBe('a [31mb c d e')
  })
  test('null and numbers are safe', () => {
    expect(plain(undefined)).toBe('')
    expect(plain(42)).toBe('42')
  })
})

test('basename works on posix and windows paths', () => {
  expect(basename('/work/shop/')).toBe('shop')
  expect(basename('C:\\work\\shop')).toBe('shop')
  expect(basename('')).toBe('')
})

test('readout counts every step and new files, and says how things stand', () => {
  const steps = [step(1), step(2, { category: 'create', techLabel: 'Write src/a.ts' }), step(3, { category: 'create', status: 'failed' })]
  const r = readoutOf(state({ steps, explainer: explainer(1000, 234) }))
  expect(r).toMatchObject({ step: 3, files: 1, checks: 'none', status: 'NEEDS A FIX', light: 'alert', elapsed: '00:02', live: true, project: 'shop' })
})

test('readout says NEEDS YOU while Claude waits for a permission, and WORKING mid-turn', () => {
  expect(readoutOf(state({ steps: [step(1)], attention: 'permission' }))).toMatchObject({ status: 'NEEDS YOU' })
  expect(readoutOf(state({ steps: [step(1)], attention: 'working' }))).toMatchObject({ status: 'WORKING', light: 'busy' })
  expect(readoutOf(state({ steps: [step(1)] })).status).toBe('ALL GOOD')
})

test('a dev server the person stopped is not a failure on the pane', () => {
  const stopped = step(3, { category: 'run', status: 'failed', techLabel: 'Bash: npm run dev', output: { stdout: '', stderr: '', interrupted: true } })
  expect(readoutOf(state({ steps: [step(1, { category: 'prompt' }), step(2, { category: 'edit' }), stopped] }))).toMatchObject({ status: 'ALL GOOD', light: 'ok' })
})

test('the pane still counts both token kinds', () => {
  expect(textModel(state({ steps: [step(1)], explainer: explainer(1000, 234) })).readout.tokens).toBe(1234)
})

test('textModel windows the newest steps but keeps their real numbers', () => {
  const steps = Array.from({ length: 1042 }, (_, i) => step(i + 1))
  const m = textModel(state({ steps }))
  expect(m.steps).toHaveLength(50)
  expect(m.steps.at(-1)?.num).toBe(1042)
  expect(m.steps[0]?.num).toBe(993)
  expect(m.readout.step).toBe(1042)
})

test('textModel carries the explanation and its glossary term', () => {
  const m = textModel(state({ steps: [step(1, { explanation: { plain: 'Adds Stripe.', why: 'Payments.', concept: { term: 'SDK', definition: 'A kit.' }, decision: null } })] }))
  expect(m.steps[0]).toMatchObject({ plain: 'Adds Stripe.', why: 'Payments.', chip: 'SDK', title: 'INSTALL · pnpm add stripe' })
})

test('textModel marks the offline state', () => {
  expect(textModel(state({ offline: true })).offline).toBe(true)
})

describe('statusLine', () => {
  test('number, title and a status mark', () => {
    expect(statusLine(state({ steps: [step(42, { status: 'running' })] }))).toBe('◢ 001 INSTALL · PNPM ADD STRIPE ●')
  })
  test('cut to fit keeps the mark', () => {
    const s = statusLine(state({ steps: [step(1, { status: 'failed' })] }), 20)!
    expect([...s].length).toBe(20)
    expect(s.endsWith(' ✕')).toBe(true)
    expect(s).toContain('…')
  })
  test('cleared when offline or empty', () => {
    expect(statusLine(state())).toBeUndefined()
    expect(statusLine(state({ steps: [step(1)], offline: true }))).toBeUndefined()
  })
  test('hostile techLabel is cleaned', () => {
    // eslint-disable-next-line no-control-regex -- asserts that no control character survives
    expect(statusLine(state({ steps: [step(1, { techLabel: 'Bash: echo \u001b]0;pwned\u0007' })] }))).not.toMatch(/[\u0000-\u001f]/)
  })
})

describe('bandLine', () => {
  test('prefers the plain explanation, else the caption', () => {
    expect(bandLine(state({ steps: [step(1)] }))).toBe('Installing thing 1')
    expect(bandLine(state({ steps: [step(1, { explanation: { plain: 'Adds\nStripe.', why: 'x', concept: null, decision: null } })] }))).toBe('Adds Stripe.')
  })
  test('hidden with no steps or offline', () => {
    expect(bandLine(state())).toBeUndefined()
    expect(bandLine(state({ steps: [step(1)], offline: true }))).toBeUndefined()
  })
})

test('stepsPrint changes when an older step gets its explanation; explainerPrint tracks tokens', () => {
  const a = [step(1), step(2)]
  const b = [step(1, { explanation: { unavailable: 'off' } }), step(2)]
  expect(stepsPrint(a)).not.toBe(stepsPrint(b))
  expect(stepsPrint(a)).toBe(stepsPrint([...a]))
  expect(explainerPrint(explainer(1, 1))).not.toBe(explainerPrint(explainer(1, 2)))
  expect(explainerPrint(null)).toBe(explainerPrint(null))
})

describe('width', () => {
  test('wide and emoji count as two columns', () => {
    expect(width('abc')).toBe(3)
    expect(width('支付')).toBe(4)
    expect(width('🚀x')).toBe(3)
  })
})

test('statusLine fits wide titles by columns', () => {
  const s = statusLine(state({ steps: [step(1, { techLabel: 'Bash: echo 支付支付支付支付支付支付支付支付' })] }), 24)!
  expect(width(s)).toBeLessThanOrEqual(24)
  expect(s.endsWith(' ✓')).toBe(true)
})

test('plain strips the Arabic letter mark', () => {
  expect(plain('a\u061cb')).toBe('a b')
})

test('workstationUrl uses the located port', () => {
  expect(workstationUrl(state({ port: 7390 }))).toBe('http://localhost:7390')
})
