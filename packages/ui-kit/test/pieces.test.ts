import { describe, expect, test } from 'vitest'
import { ActionIdSchema, ActorIdSchema, EffectIdSchema, PlaceIdSchema } from '@sidecar/shared'
import { actor } from '../src/pieces/actors'
import { effect } from '../src/pieces/effects'
import { place } from '../src/pieces/places'
import { prop } from '../src/pieces/props'
import type { PropKind } from '../src/timeline'

/** Cheap well-formedness check: tags balance, and there are no raw hex colours or NaN. */
function wellFormed(svg: string) {
  const opens = (svg.match(/<(?!\/)[a-z]+[^>]*?(?<!\/)>/g) ?? []).length
  const closes = (svg.match(/<\/[a-z]+>/g) ?? []).length
  expect(opens).toBe(closes)
  expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  expect(svg).not.toMatch(/="#[0-9a-f]{3,6}"/i)
}

describe('pieces', () => {
  test.each(ActorIdSchema.options)('actor %s draws in every pose', (id) => {
    for (const pose of ['idle', 'walk', ...ActionIdSchema.options] as const) {
      for (const facing of [1, -1] as const) wellFormed(actor({ id, x: 0, y: 0, pose, p: 0.5, facing }, 1000))
    }
  })
  test.each(PlaceIdSchema.options)('place %s draws, with and without a label', (id) => {
    wellFormed(place(id, { floors: 1 }))
    wellFormed(place(id, { floors: 5, label: 'Stripe' }))
  })
  test('Your App grows with floors and caps at MAX_FLOORS', () => {
    const windows = (s: string) => (s.match(/class="sk-window"/g) ?? []).length
    expect(windows(place('app', { floors: 3 }))).toBe(3 * windows(place('app', { floors: 1 })))
    expect(place('app', { floors: 99 })).toBe(place('app', { floors: 5 }))
    expect(place('app', { floors: 0 })).toBe(place('app', { floors: 1 }))
  })
  test('labels are escaped and truncated (Review Focus 1)', () => {
    const s = place('service', { floors: 1, label: '<script>alert(1)</script>' + 'x'.repeat(200) })
    expect(s).not.toContain('<script>')
    expect(s).toContain('&lt;script&gt;')
    expect(s).toContain('…')
  })
  test.each(['cable', 'wrench', 'magnifier', 'book', 'box', 'gadget', 'rocket', 'parcel'] satisfies PropKind[])('prop %s draws at p=0, 0.5, 1', (kind) => {
    for (const p of [0, 0.5, 1]) wellFormed(prop({ kind, from: { x: 10, y: 20 }, to: { x: 200, y: 100 }, p }, 1000))
  })
  test.each(EffectIdSchema.options)('effect %s draws at p=0, 0.5, 1', (id) => {
    for (const p of [0, 0.5, 1]) wellFormed(effect(id, p, 1000))
  })
})
