import { describe, it, expect } from 'vitest'
import { renderText, lineWidth, type Line, type TextModel, type TextStep } from '../src/index'

const plain = (ls: Line[]) => ls.map((l) => l.map((s) => s.text).join('')).join('\n')

const steps: TextStep[] = [
  { num: 38, title: 'Read', caption: 'layout.tsx', status: 'ok' },
  { num: 39, title: 'Test', caption: 'vitest', status: 'failed', plain: 'The tests did not pass.' },
  { num: 40, title: 'Read', caption: 'layout.tsx', status: 'ok' },
  { num: 41, title: 'New file', caption: 'checkout.ts', status: 'ok' },
  {
    num: 42, title: 'Install', caption: 'Stripe', status: 'running',
    plain: 'Added the Stripe toolkit so your code can take payments.',
    why: 'hand-built card handling is risky for money.', chip: 'npm package',
  },
]
const model: TextModel = {
  project: 'shop-app', live: true,
  readout: { step: 42, files: 6, tokens: 4300, elapsed: '02:14' }, steps,
}

describe('renderText', () => {
  for (const cols of [40, 60, 80, 120]) {
    it(`snapshot at ${cols} columns`, () => {
      expect(plain(renderText(model, cols))).toMatchSnapshot()
    })
  }

  it('never exceeds columns, and rows by default, at any width', () => {
    for (let c = 40; c <= 160; c++) {
      const ls = renderText(model, c)
      expect(ls.length).toBeLessThanOrEqual(12)
      for (const l of ls) expect(lineWidth(l)).toBeLessThanOrEqual(c)
    }
  })

  it('aligns right borders of boxed lines', () => {
    for (const c of [40, 57, 80, 120]) {
      const rows = plain(renderText(model, c)).split('\n')
      const boxed = rows.filter((r) => /[│┐┘]$/.test(r))
      expect(boxed.length).toBeGreaterThan(4)
      for (const r of boxed) expect([...r].length).toBe(c - 1)
    }
  })

  it('handles an empty session', () => {
    const t = plain(renderText({ ...model, steps: [] }, 80))
    expect(t).toContain('Waiting for Claude to do something…')
    expect(t).toContain('STEP')
  })

  it('handles offline', () => {
    const ls = renderText({ ...model, offline: true }, 80)
    const t = plain(ls)
    expect(t).toContain(' OFFLINE ')
    expect(t).toContain(' retrying…')
    expect(t).not.toContain('Added the Stripe')
    for (const l of ls) expect(lineWidth(l)).toBeLessThanOrEqual(80)
  })

  it('never overflows on a 300 character word', () => {
    const path = 'src/' + 'a'.repeat(296)
    const m: TextModel = {
      ...model,
      project: path,
      steps: [{ num: 1, title: path, caption: path, status: 'running', plain: path, why: path, chip: path }],
    }
    for (const c of [40, 80, 160]) for (const l of renderText(m, c, 30)) expect(lineWidth(l)).toBeLessThanOrEqual(c)
  })

  it('gives one line below 40 columns', () => {
    const ls = renderText(model, 20)
    expect(ls).toHaveLength(1)
    expect(lineWidth(ls[0]!)).toBeLessThanOrEqual(20)
    expect(plain(ls)).toBe('SIDECAR · STEP 042')
  })

  it('grows step numbers past 999', () => {
    const m: TextModel = { ...model, steps: [{ ...steps[4]!, num: 1000 }, { ...steps[3]!, num: 999 }] }
    expect(plain(renderText(m, 80))).toContain('╱1000╲')
  })

  it('marks the running tab inverse and failure accent', () => {
    const ls = renderText(model, 80, 20)
    expect(ls.flat().some((s) => s.tone === 'inverse' && s.text === '╱042╲')).toBe(true)
    expect(ls.flat().some((s) => s.tone === 'accent' && s.text === '✕')).toBe(true)
  })
})
