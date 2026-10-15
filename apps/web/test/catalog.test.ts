import { describe, expect, test } from 'vitest'
import type { GlossaryEntry } from '@sidecar/shared'
import { groupCatalog } from '../src/catalog'

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
