import { formatElapsed, STEP_KIND, stepKind, stepSubject, stepTitle } from '../src/index'
import { describe, expect, test } from 'vitest'
import { clamp, easeInOut, easeOutBack, lerp, progress } from '../src/ease'
import { esc, g, label, MAX_LABEL, n, truncate } from '../src/svg'
import { BEAT_MS, color, palette, themeCss } from '../src/tokens'

describe('ease', () => {
  test('clamp, lerp, progress', () => {
    expect(clamp(2)).toBe(1)
    expect(clamp(-1)).toBe(0)
    expect(lerp(10, 20, 0.5)).toBe(15)
    expect(progress(50, 0, 100)).toBe(0.5)
    expect(progress(-5, 0, 100)).toBe(0)
    expect(progress(500, 0, 100)).toBe(1)
    expect(progress(10, 10, 10)).toBe(1) // zero-length interval counts as done once reached
  })
  test('easings hit their endpoints and clamp', () => {
    for (const f of [easeInOut, easeOutBack]) {
      expect(f(0)).toBeCloseTo(0)
      expect(f(1)).toBeCloseTo(1)
      expect(f(-3)).toBeCloseTo(0)
      expect(f(9)).toBeCloseTo(1)
    }
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeOutBack(0.7)).toBeGreaterThan(1) // overshoots
  })
})

describe('svg helpers', () => {
  test('n rounds and never prints -0', () => {
    expect(n(1.26)).toBe('1.3')
    expect(n(-0.04)).toBe('0')
    expect(n(0.123, 2)).toBe('0.12')
  })
  test('esc escapes all XML-significant characters', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
  test('label trims, truncates to MAX_LABEL with an ellipsis, then escapes', () => {
    expect(truncate('  Stripe  ')).toBe('Stripe')
    const long = 'x'.repeat(200)
    expect(truncate(long)).toHaveLength(MAX_LABEL)
    expect(truncate(long).endsWith('…')).toBe(true)
    expect(label('<script>alert(1)</script>')).not.toContain('<')
  })
  test('g wraps in a translated group', () => {
    expect(g(1.04, 2, '<b/>')).toBe('<g transform="translate(1 2)"><b/></g>')
  })
})

describe('tokens', () => {
  test('light and dark palettes have the same tokens', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort())
    expect(Object.keys(palette.light).sort()).toEqual(
      ['accent','blockApp','blockAuth','blockData','blockOk','blockService','card','grid','ink','ink2','label','onLabel','paper'].sort())
  })
  test('spec values', () => {
    expect(palette.light.paper).toBe('#EDECE8'); expect(palette.dark.paper).toBe('#141414')
    expect(palette.light.accent).toBe('#FF4A1C'); expect(palette.dark.accent).toBe('#FF4A1C')
    expect(palette.light.ink2).toBe('#5F5F5F')
    // text on the yellow label pill: ink in light, paper in dark
    expect(palette.light.onLabel).toBe(palette.light.ink); expect(palette.dark.onLabel).toBe(palette.dark.paper)
  })
  test('color is a CSS variable with the light fallback', () => {
    expect(color('ink')).toBe(`var(--sk-ink, ${palette.light.ink})`)
  })
  test('themeCss: auto follows the OS; data-theme forces either', () => {
    const css = themeCss()
    expect(css).toContain(':root {')
    expect(css).toContain('@media (prefers-color-scheme: dark) { :root:not([data-theme="light"])')
    expect(css).toContain(':root[data-theme="dark"]')
    for (const k of Object.keys(palette.light)) expect(css).toContain(`--sk-${k}:`)
  })
  test('themeCss: block side shading, deeper in dark', () => {
    const css = themeCss()
    expect(css).toContain('.sk-face-l{filter:brightness(.88)}')
    expect(css).toContain('.sk-face-r{filter:brightness(.95)}')
    expect(css).toContain(':root:not([data-theme="light"]) .sk-face-l{filter:brightness(.75)}')
    expect(css).toContain(':root:not([data-theme="light"]) .sk-face-r{filter:brightness(.88)}')
    expect(css).toContain(':root[data-theme="dark"] .sk-face-l{filter:brightness(.75)}')
    expect(css).toContain(':root[data-theme="dark"] .sk-face-r{filter:brightness(.88)}')
  })
  test('every action has a positive duration', () => {
    for (const ms of Object.values(BEAT_MS)) expect(ms).toBeGreaterThan(0)
  })
})

describe('step formatters', () => {
  test('stepTitle reads CATEGORY · subject', () => {
    expect(stepTitle({ category: 'install', techLabel: 'Bash: pnpm add stripe' })).toBe('INSTALL · pnpm add stripe')
    expect(stepTitle({ category: 'create', techLabel: 'Write src/users.ts' })).toBe('NEW FILE · users.ts')
    expect(stepTitle({ category: 'prompt', techLabel: 'UserPromptSubmit' })).toBe('PROMPT')
  })
  test('stepSubject keeps URLs whole', () => {
    expect(stepSubject('WebFetch https://api.stripe.com/v1')).toBe('https://api.stripe.com/v1')
  })
  test('formatElapsed is mm:ss and never negative', () => {
    expect(formatElapsed(252_000)).toBe('04:12')
    expect(formatElapsed(-5)).toBe('00:00')
  })
})

describe('stepKind', () => {
  test('every category has a plain kind that fits a readout note', () => {
    // Record<Category, string> makes a missing category a type error
    expect(Object.keys(STEP_KIND)).toHaveLength(14)
    for (const k of Object.values(STEP_KIND)) {
      expect(k.length).toBeLessThanOrEqual(18)
      expect(k).toBe(k.toUpperCase())
      expect(k).not.toMatch(/\b(BASH|NPM|GIT|MCP|CLI|API|EDIT|WRITE|READ)\b/)
    }
  })
  test('cards say what happened, not the tool', () => {
    expect(stepKind({ category: 'test' })).toBe('CHECKS')
    expect(stepKind({ category: 'git' })).toBe('CHECKPOINT')
    expect(stepKind({ category: 'fallback' })).toBe('STEP')
  })
})
