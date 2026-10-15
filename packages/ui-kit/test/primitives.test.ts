import { describe, expect, test } from 'vitest'
import * as P from '../src/primitives'

/** Tags balance; no NaN/undefined; no raw hex in attributes. */
export function wellFormed(svg: string) {
  const opens = (svg.match(/<(?!\/)[a-z]+[^>]*?(?<!\/)>/gi) ?? []).length
  const closes = (svg.match(/<\/[a-z]+>/gi) ?? []).length
  expect(opens).toBe(closes)
  expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  expect(svg).not.toMatch(/="#[0-9a-f]{3,8}"/i)
}
const o = { x: 300, y: 200 }

describe('batch 1', () => {
  test('gridPaper', () => wellFormed(P.gridPaper(640, 360)))
  test.each(['app', 'service', 'data', 'auth', 'ok', 'paper'] as const)('isoBlock %s solid and dashed', (tone) => {
    wellFormed(P.isoBlock(o, { x: 0, y: 0, z: 0, w: 40, d: 30, h: 20 }, tone))
    const dashed = P.isoBlock(o, { x: 0, y: 0, z: 0, w: 40, d: 30, h: 20 }, tone, { dashed: true })
    expect(dashed).toContain('stroke-dasharray')
    expect(dashed).not.toContain('var(--sk-block')
  })
  test('isoStack clamps floors and dashes the building floor', () => {
    expect(P.isoStack(o, 99, {})).toBe(P.isoStack(o, 5, {}))
    expect(P.isoStack(o, 0, {})).toBe(P.isoStack(o, 1, {}))
    expect(P.isoStack(o, 3, { building: true })).toContain('stroke-dasharray')
  })
  test('callout escapes and truncates', () => {
    const s = P.callout({ x: 1, y: 1 }, { x: 50, y: 20 }, '<script>' + 'x'.repeat(200), 'a & b')
    expect(s).not.toContain('<script>'); expect(s).toContain('&lt;script&gt;'); expect(s).toContain('&amp;'); expect(s).toContain('…')
    wellFormed(s)
  })
  test('connector draws partially and fully', () => {
    for (const p of [0, 0.5, 1]) wellFormed(P.connector({ x: 10, y: 10 }, { x: 200, y: 80 }, p))
    expect(P.connector({ x: 10, y: 10 }, { x: 200, y: 80 }, 0.5)).not.toBe(P.connector({ x: 10, y: 10 }, { x: 200, y: 80 }, 1))
  })
})
