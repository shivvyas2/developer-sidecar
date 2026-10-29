import { describe, expect, test } from 'vitest'
import { PlaceIdSchema } from '@sidecar/shared'
import { OTHERS, PLACES, placeAt } from '../src/legendText'

describe('legend', () => {
  test('every place in the town has an entry', () => {
    expect(Object.keys(PLACES).sort()).toEqual([...PlaceIdSchema.options].sort())
  })
  test('plain words: short, no em dashes, no code jargon', () => {
    for (const e of [...Object.values(PLACES), ...OTHERS]) {
      expect(e.text.length).toBeLessThanOrEqual(140)
      expect(e.text).not.toMatch(/—/)
      expect(e.text).not.toMatch(/\b(npm|repo|API|SDK|endpoint|schema|CLI|bash|commit)\b/i)
    }
  })
})

describe('placeAt', () => {
  // the web tests run in node, so this is a minimal stand-in for an SVG element's closest()
  const el = (cls: string | null, parent: unknown = null) => ({
    getAttribute: () => cls,
    closest(sel: string) { return cls?.includes('sk-place--') && sel.includes('sk-place--') ? this : (parent as { closest: (s: string) => unknown } | null)?.closest(sel) ?? null },
  }) as unknown as Element
  test('finds the place from the group around the tapped shape', () => {
    expect(placeAt(el(null, el('sk-place sk-place--service')))).toBe('service')
    expect(placeAt(el('sk-place sk-place--app'))).toBe('app')
  })
  test('anything else is no place', () => {
    expect(placeAt(null)).toBeNull()
    expect(placeAt(el('sk-frame'))).toBeNull()
    expect(placeAt(el('sk-place sk-place--spaceship'))).toBeNull()
  })
})
