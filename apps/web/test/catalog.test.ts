import { describe, expect, test } from 'vitest'
import type { GlossaryEntry } from '@sidecar/shared'
import { groupCatalog, termSlug } from '../src/catalog'

const e = (term: string): GlossaryEntry => ({ term, definition: `${term} def`, sessionId: 's', stepId: 'x', at: 0 }) as GlossaryEntry

describe('groupCatalog', () => {
  test('groups by first letter in letter order', () => {
    expect(groupCatalog([e('Cache'), e('API'), e('Bundler')]).map((g) => g.letter)).toEqual(['A', 'B', 'C'])
  })
  test('puts non-letter terms under # last', () => {
    const g = groupCatalog([e('9p'), e('Zed'), e('_x'), e('Alpha')])
    expect(g.map((x) => x.letter)).toEqual(['A', 'Z', '#'])
    expect(g[2]!.entries.map((x) => x.term).sort()).toEqual(['9p', '_x'])
  })
  test('sorts case-insensitively within a group', () => {
    const g = groupCatalog([e('beta'), e('Bravo'), e('Banana')])
    expect(g[0]!.entries.map((x) => x.term)).toEqual(['Banana', 'beta', 'Bravo'])
  })
  test('lowercase terms share the uppercase letter', () => {
    expect(groupCatalog([e('apple'), e('Ant')])).toHaveLength(1)
  })
  test('pads counts to three digits', () => {
    expect(groupCatalog([e('a'), e('ab'), e('ac')])[0]!.count).toBe('003')
  })
  test('empty input gives no groups', () => {
    expect(groupCatalog([])).toEqual([])
  })
})

describe('termSlug', () => {
  test('lowercases, turns runs of non-alphanumerics into one dash and adds the index', () => {
    expect(termSlug('API', 0)).toBe('api-0')
    expect(termSlug('Server Actions (Next.js)', 3)).toBe('server-actions-next-js-3')
    expect(termSlug('  C++ ', 1)).toBe('c-1')
    expect(termSlug('***', 2)).toBe('term-2')
  })
  test('"API" and "api" never collide', () => {
    expect(termSlug('API', 0)).not.toBe(termSlug('api', 1))
  })
  test('ids are valid for aria-controls: no spaces', () => {
    for (const t of ['a b', 'x\ty', 'é ü']) expect(termSlug(t, 0)).not.toMatch(/\s/)
  })
})
