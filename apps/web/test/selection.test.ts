import { describe, expect, test } from 'vitest'
import { initialSelection, selectedId, selectionReducer, stepNumber, tabFromSearch, type Selection } from '../src/selection'

describe('selection', () => {
  test('follows the latest step by default', () => {
    expect(selectedId(initialSelection, 'c')).toBe('c')
    expect(selectedId(initialSelection, null)).toBe(null)
  })
  test('picking an older step stops following', () => {
    const s = selectionReducer(initialSelection, { type: 'pick', id: 'a', latestId: 'c' })
    expect(s.follow).toBe(false)
    expect(selectedId(s, 'c')).toBe('a')
    expect(selectedId(s, 'd')).toBe('a')
  })
  test('picking the latest resumes following', () => {
    const old = selectionReducer(initialSelection, { type: 'pick', id: 'a', latestId: 'c' })
    const s = selectionReducer(old, { type: 'pick', id: 'c', latestId: 'c' })
    expect(s.follow).toBe(true)
    expect(selectedId(s, 'd')).toBe('d')
  })
  test('live resumes following', () => {
    const old = selectionReducer(initialSelection, { type: 'pick', id: 'a', latestId: 'c' })
    const s = selectionReducer(old, { type: 'live' })
    expect(s).toEqual({ id: null, follow: true })
    expect(selectedId(s, 'd')).toBe('d')
  })
  test('reset returns to the initial selection', () => {
    const old = selectionReducer(initialSelection, { type: 'pick', id: 'a', latestId: 'c' })
    expect(selectionReducer(old, { type: 'reset' })).toEqual(initialSelection)
  })
  test('stepNumber pads to three digits and grows past 999', () => {
    expect(stepNumber(0)).toBe('001')
    expect(stepNumber(41)).toBe('042')
    expect(stepNumber(1203)).toBe('1204')
  })
  test('500 steps arriving while following keep the latest selected', () => {
    let s: Selection = initialSelection
    const ids: string[] = []
    for (let i = 0; i < 500; i++) {
      ids.push(`s${i}`)
      const latest = ids[ids.length - 1] ?? null
      expect(selectedId(s, latest)).toBe(latest)
      // a stray re-pick of the current latest keeps following
      if (i % 50 === 0) s = selectionReducer(s, { type: 'pick', id: `s${i}`, latestId: latest })
    }
    expect(s.follow).toBe(true)
    expect(selectedId(s, 's499')).toBe('s499')
  })
})

describe('tabFromSearch', () => {
  const valid = ['stage', 'decisions']
  test('reads ?tab= when valid, else falls back', () => {
    expect(tabFromSearch('?tab=decisions', valid, 'stage')).toBe('decisions')
    expect(tabFromSearch('?tab=nope', valid, 'stage')).toBe('stage')
    expect(tabFromSearch('', valid, 'stage')).toBe('stage')
  })
})
