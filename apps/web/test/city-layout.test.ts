import { describe, expect, test } from 'vitest'
import type { Building, BuildingKind, CityTown } from '@sidecar/shared'
import { ISLAND_HALF, ROAD_HALF, ROAD_Z, plotTown } from '../src/city/layout'

const b = (id: string, kind: BuildingKind): Building => ({ id, kind, name: id, mapId: null, finish: 'built', files: [], stepIds: [], lit: false })
const town = (buildings: Building[]): CityTown => ({ stage: 'town', buildings, git: null, files: 0 })
const big = () => town([
  ...Array.from({ length: 40 }, (_, i) => b(`shop:${i}`, 'shop')),
  b('office', 'office'), b('warehouse', 'warehouse'),
  ...Array.from({ length: 12 }, (_, i) => b(`workshop:${i}`, 'workshop')),
  ...Array.from({ length: 8 }, (_, i) => b(`service:${i}`, 'service')),
  b('vault', 'vault'), b('yard', 'yard'), b('inspector', 'inspector'), b('archive', 'archive'), b('site-office', 'siteOffice'),
])

describe('plotTown', () => {
  test('every building gets a plot and no two overlap', () => {
    const plots = [...plotTown(big()).entries()]
    expect(plots).toHaveLength(big().buildings.length)
    for (let i = 0; i < plots.length; i++) for (let j = i + 1; j < plots.length; j++) {
      const [, a] = plots[i]!, [, c] = plots[j]!
      const apart = Math.abs(a.x - c.x) >= (a.w + c.w) / 2 || Math.abs(a.z - c.z) >= (a.d + c.d) / 2
      expect(apart, `${plots[i]![0]} and ${plots[j]![0]}`).toBe(true)
    }
  })
  test('everything fits on the island and stays off the main road', () => {
    for (const [id, p] of plotTown(big())) {
      expect(Math.abs(p.x) + p.w / 2, id).toBeLessThanOrEqual(ISLAND_HALF)
      expect(Math.abs(p.z) + p.d / 2, id).toBeLessThanOrEqual(ISLAND_HALF)
      expect(Math.abs(p.z - ROAD_Z) >= ROAD_HALF + p.d / 2, id).toBe(true)
    }
  })
  test('adding a shop never moves an existing plot', () => {
    const small = town([b('shop:a', 'shop'), b('office', 'office'), b('site-office', 'siteOffice')])
    const grown = town([b('shop:a', 'shop'), b('shop:b', 'shop'), b('office', 'office'), b('service:Stripe', 'service'), b('site-office', 'siteOffice')])
    const before = plotTown(small), after = plotTown(grown)
    for (const [id, p] of before) expect(after.get(id)).toEqual(p)
  })
  test('services sit across the main road', () => {
    for (const [id, p] of plotTown(big())) if (id.startsWith('service:')) expect(p.z - p.d / 2).toBeGreaterThan(ROAD_Z + ROAD_HALF)
  })
})
