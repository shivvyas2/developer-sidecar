import { expect } from 'vitest'

/** Tags balance; no NaN/undefined; no raw hex in attributes. */
export function wellFormed(svg: string) {
  const opens = (svg.match(/<(?!\/)[a-z]+[^>]*?(?<!\/)>/gi) ?? []).length
  const closes = (svg.match(/<\/[a-z]+>/gi) ?? []).length
  expect(opens).toBe(closes)
  expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  expect(svg).not.toMatch(/="#[0-9a-f]{3,8}"/i)
}
