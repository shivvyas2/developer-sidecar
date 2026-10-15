import { describe, expect, test } from 'vitest'
import { applyTheme, nextTheme, readTheme, writeTheme, type ThemePref } from '../src/theme'

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const throwing = {
  getItem: (): string | null => { throw new Error('blocked') },
  setItem: (): void => { throw new Error('quota') },
}

describe('readTheme', () => {
  test('defaults to auto with no storage or no value', () => {
    expect(readTheme(null)).toBe('auto')
    expect(readTheme(mem())).toBe('auto')
  })
  test('reads light and dark', () => {
    expect(readTheme(mem({ 'sidecar-theme': 'light' }))).toBe('light')
    expect(readTheme(mem({ 'sidecar-theme': 'dark' }))).toBe('dark')
  })
  test('ignores junk', () => {
    expect(readTheme(mem({ 'sidecar-theme': 'purple' }))).toBe('auto')
    expect(readTheme(mem({ 'sidecar-theme': '' }))).toBe('auto')
  })
  test('survives a throwing storage', () => {
    expect(readTheme(throwing)).toBe('auto')
  })
})

describe('writeTheme', () => {
  test('stores the preference under sidecar-theme', () => {
    const s = mem()
    writeTheme(s, 'dark')
    expect(s.m.get('sidecar-theme')).toBe('dark')
    expect(readTheme(s)).toBe('dark')
  })
  test('swallows errors and tolerates null', () => {
    expect(() => writeTheme(throwing, 'light')).not.toThrow()
    expect(() => writeTheme(null, 'light')).not.toThrow()
  })
})

describe('applyTheme', () => {
  test('sets data-theme for light and dark, removes it for auto', () => {
    const root = { dataset: {} as DOMStringMap }
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
    applyTheme(root, 'auto')
    expect('theme' in root.dataset).toBe(false)
  })
})

test('nextTheme cycles auto, light, dark', () => {
  const seen: ThemePref[] = []
  let p: ThemePref = 'auto'
  for (let i = 0; i < 4; i++) { seen.push(p); p = nextTheme(p) }
  expect(seen).toEqual(['auto', 'light', 'dark', 'auto'])
})
