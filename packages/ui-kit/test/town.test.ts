import { expect, test } from 'vitest'
import type { SceneSpec } from '@sidecar/shared'
import { townFrom } from '../src/town'

const spec = (cast: SceneSpec['cast']): SceneSpec => ({ scene: 's', cast, beats: [], caption: '' })
const create = (status: 'ok' | 'failed' = 'ok') => ({ category: 'create' as const, status, scene: spec(['claude', { place: 'app' }]) })

test('empty session still has Your App with one floor', () => {
  expect(townFrom([])).toEqual({ places: ['app'], labels: {}, appFloors: 1 })
})

test('places appear in first-use order; the latest label wins', () => {
  const t = townFrom([
    { category: 'external', status: 'ok', scene: spec(['claude', { place: 'service', label: 'Stripe' }]) },
    { category: 'install', status: 'ok', scene: spec(['claude', { place: 'toolbox' }]) },
    { category: 'external', status: 'failed', scene: spec(['claude', { place: 'service', label: 'OpenAI' }]) },
  ])
  expect(t.places).toEqual(['app', 'service', 'toolbox'])
  expect(t.labels.service).toBe('OpenAI')
})

test('Your App gains a floor every 3 successful created files, capped at 5', () => {
  expect(townFrom(Array.from({ length: 2 }, () => create())).appFloors).toBe(1)
  expect(townFrom(Array.from({ length: 3 }, () => create())).appFloors).toBe(2)
  expect(townFrom(Array.from({ length: 3 }, () => create('failed'))).appFloors).toBe(1)
  expect(townFrom(Array.from({ length: 100 }, () => create())).appFloors).toBe(5)
})
