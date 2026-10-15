import { expect, test } from 'vitest'
import { iso, ISO_C, ISO_S } from '../src/iso'
test('origin maps to origin; axes follow the 30 degree projection', () => {
  expect(iso(0, 0, 0, { x: 100, y: 50 })).toEqual({ x: 100, y: 50 })
  const p = iso(10, 0, 0, { x: 0, y: 0 })
  expect(p.x).toBeCloseTo(10 * ISO_C); expect(p.y).toBeCloseTo(10 * ISO_S)
  expect(iso(0, 0, 5, { x: 0, y: 0 }).y).toBe(-5)
  expect(iso(0, 10, 0, { x: 0, y: 0 }, 2).x).toBeCloseTo(-20 * ISO_C)
})
