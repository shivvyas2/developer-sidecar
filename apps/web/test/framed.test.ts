import { describe, expect, test } from 'vitest'
import { FRAMED_MIN, framedAt, readoutFields } from '../src/framed'

describe('framedAt', () => {
  test('the SVG frame shows only above the one-column breakpoint (860px)', () => {
    expect(FRAMED_MIN).toBe(860)
    expect(framedAt(1400)).toBe(true)
    expect(framedAt(861)).toBe(true)
    expect(framedAt(860)).toBe(false)
    expect(framedAt(700)).toBe(false)
    expect(framedAt(320)).toBe(false)
  })
  test('an unknown width (SSR, tests) keeps the frame', () => {
    expect(framedAt(undefined)).toBe(true)
    expect(framedAt(Number.NaN)).toBe(true)
  })
})

describe('readoutFields', () => {
  test('the DOM readout shows the same numbers as the SVG one', () => {
    expect(readoutFields({ step: 4, files: 1, tokens: 4300, now: 'TEST', elapsed: '00:42', live: true }))
      .toEqual([{ label: 'STEP', value: '004' }, { label: 'FILES', value: '01' }, { label: 'TOKENS', value: '4.3k' }, { label: 'ELAPSED', value: '00:42' }])
    expect(readoutFields({ step: Number.NaN, files: -1, tokens: Number.NaN, now: '', elapsed: '', live: false }))
      .toEqual([{ label: 'STEP', value: '000' }, { label: 'FILES', value: '00' }, { label: 'TOKENS', value: '0' }, { label: 'ELAPSED', value: '00:00' }])
  })
})
