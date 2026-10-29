import { describe, expect, test } from 'vitest'
import { readMotion, reduceMotion, writeMotion } from '../src/city/motion'

const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

describe('motion preference', () => {
  test('auto until chosen, and a choice survives', () => {
    const s = store()
    expect(readMotion(s)).toBe('auto')
    writeMotion(s, 'reduce')
    expect(readMotion(s)).toBe('reduce')
  })
  test('unreadable storage reads auto', () => {
    expect(readMotion({ getItem: () => { throw new Error('blocked') } })).toBe('auto')
    expect(readMotion(null)).toBe('auto')
  })
  test.each([['auto', false, false], ['auto', true, true], ['reduce', false, true], ['full', true, false]] as const)(
    '%s with the OS asking %s reduces: %s', (pref, os, want) => expect(reduceMotion(pref, os)).toBe(want))
})
