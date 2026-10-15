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
    expect(t).toContain(' SIDECAR OFFLINE ')
    expect(t).toContain(' · retrying')
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

  it('strips terminal control and bidi characters from every model string', () => {
    const bad = ['\x1b]0;PWN\x07', '\x1b[2J', '‮', '​', '⁦', '\x9b']
    const dirty = (t: string) => `${bad.join('')}${t}${bad.join('')}`
    const m: TextModel = {
      project: dirty('proj'), live: true,
      readout: { step: 1, files: 1, tokens: 1, elapsed: dirty('00:01') },
      steps: [{ num: 1, title: dirty('Read'), caption: dirty('a.ts'), status: 'running', plain: dirty('plain'), why: dirty('why'), chip: dirty('chip') }],
    }
    const out = plain(renderText(m, 120, 30))
    // eslint-disable-next-line no-control-regex -- asserts that no control character survives
    expect(out).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/)
    for (const t of ['PROJ', 'READ', 'a.ts', 'plain', 'why', 'chip', '00:01']) expect(out).toContain(t)
  })

  it('formats tokens like the stage readout and guards bad numbers', () => {
    const at = (tokens: number, files = 6, step = 42) => plain(renderText({ ...model, readout: { ...model.readout, tokens, files, step } }, 80))
    expect(at(Number.NaN)).toMatch(/│ 0 +│/)
    expect(at(999_999)).toContain('│ 1M ')
    expect(at(12_000)).toContain('│ 12k ')
    const nan = at(Number.NaN, Number.NaN, Number.NaN)
    expect(nan).not.toMatch(/NaN|Infinity/)
  })

  it('treats non-finite columns and rows as the narrowest full layout', () => {
    for (const c of [Number.NaN, Infinity, -Infinity]) {
      const ls = renderText(model, c, Number.NaN)
      expect(plain(ls)).toBe(plain(renderText(model, 40)))
    }
  })

  it('footer: singular step, no hard-coded folder', () => {
    const one = plain(renderText({ ...model, readout: { ...model.readout, files: 1 }, steps: [steps[4]!] }, 80))
    expect(one).toMatch(/ 1 STEP · 1 FILE$/)
    const many = plain(renderText(model, 80))
    expect(many).toMatch(/ 5 STEPS · 6 FILES$/)
    expect(many).not.toContain('src/')
  })

  it('header: OFFLINE only when offline, REPLAY when not live', () => {
    const replay = plain(renderText({ ...model, live: false }, 80)).split('\n')[0]!
    expect(replay).toMatch(/REPLAY $/)
    expect(replay).not.toContain('OFFLINE')
    expect(plain(renderText({ ...model, live: false, offline: true }, 80)).split('\n')[0]).toMatch(/OFFLINE $/)
  })

  it('marks an interrupted step with the pause glyph, like the web step card', () => {
    const m: TextModel = { ...model, steps: [{ ...steps[0]!, status: 'interrupted' }, steps[4]!] }
    const ls = renderText(m, 80, 20)
    expect(ls.flat().some((s) => s.text === '⏸' && s.tone === 'dim')).toBe(true)
    expect(plain(ls)).not.toContain('○')
  })
})
