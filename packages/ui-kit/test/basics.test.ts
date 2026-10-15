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
  })
  test('color is a CSS variable with the light value as fallback', () => {
    expect(color('ink')).toBe(`var(--sk-ink, ${palette.light.ink})`)
  })
  test('themeCss defines every variable for light and dark', () => {
    const css = themeCss()
    for (const k of Object.keys(palette.light)) expect(css.match(new RegExp(`--sk-${k}:`, 'g'))).toHaveLength(2)
    expect(css).toContain('prefers-color-scheme: dark')
  })
  test('every action has a positive duration', () => {
    for (const ms of Object.values(BEAT_MS)) expect(ms).toBeGreaterThan(0)
  })
})
