import { describe, expect, test } from 'vitest'
import type { ProjectMap, SceneSpec } from '@sidecar/shared'
import { nameTown, townFrom } from '../src/town'
import { render } from '../src/render'
import { scenes } from '../src/catalog'

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

test('townFrom skips a step whose scene has no cast array', () => {
  const ok = { category: 'external', status: 'ok', scene: { scene: 'connect-service', cast: ['claude', { place: 'service', label: 'Stripe' }], beats: [], caption: 'c' } }
  const bad = { category: 'create', status: 'ok', scene: { scene: 'x', cast: null, beats: [], caption: 'c' } }
  const missing = { category: 'create', status: 'ok' }
  const t = townFrom([bad, missing, ok] as never)
  expect(t.places).toContain('service')
  expect(t.labels.service).toBe('Stripe')
})

const map = (sections: ProjectMap['sections']): ProjectMap => ({ sections })
const item = (id: string, name: string, state: 'seen' | 'changed' | 'failed' = 'changed') => ({ id, name, files: [], stepIds: [], state })

describe('nameTown', () => {
  test('names the service and the first table, and counts the packages added', () => {
    const t = nameTown(townFrom([]), map([
      { kind: 'data', title: '', items: [item('data:tables', 'Database tables'), item('data:table:orders', 'Orders table')] },
      { kind: 'service', title: '', items: [item('service:Stripe', 'Stripe')] },
      { kind: 'blocks', title: '', items: [item('blocks:stripe', 'stripe'), item('blocks:pg', 'pg'), item('blocks:react', 'react', 'seen')] },
    ]))
    expect(t.places).toEqual(['app', 'service', 'database', 'toolbox'])
    expect(t.labels).toEqual({ service: 'Stripe', database: 'Orders', toolbox: '2 ADDED' })
  })
  test('a failed install is not counted as added, as the Whiteboard says it needs a fix', () => {
    const t = nameTown(townFrom([]), map([
      { kind: 'blocks', title: '', items: [item('blocks:stripe', 'stripe'), item('blocks:pg', 'pg', 'failed')] },
    ]))
    expect(t.labels.toolbox).toBe('1 ADDED')
    expect(nameTown(townFrom([]), map([{ kind: 'blocks', title: '', items: [item('blocks:pg', 'pg', 'failed')] }])).labels.toolbox).toBeUndefined()
  })
  test('a label a scene already gave wins, and places are not repeated', () => {
    const base = townFrom([{ category: 'external', status: 'ok', scene: spec(['claude', { place: 'service', label: 'OpenAI' }]) }])
    const t = nameTown(base, map([{ kind: 'service', title: '', items: [item('service:Stripe', 'Stripe')] }]))
    expect(t.places).toEqual(['app', 'service'])
    expect(t.labels.service).toBe('OpenAI')
  })
  test('an empty map changes nothing, and the input town is not mutated', () => {
    const base = townFrom([])
    expect(nameTown(base, map([]))).toEqual(base)
    nameTown(base, map([{ kind: 'service', title: '', items: [item('service:Stripe', 'Stripe')] }]))
    expect(base).toEqual({ places: ['app'], labels: {}, appFloors: 1 })
  })
  test('the names show on the stage, escaped', () => {
    const t = nameTown(townFrom([]), map([
      { kind: 'service', title: '', items: [item('service:x', 'Stripe')] },
      { kind: 'data', title: '', items: [item('data:table:orders', '<b>Orders</b> table')] },
    ]))
    const svg = render(scenes.bolt('Changing route.ts'), 1e9, { town: t })
    expect(svg).toContain('STRIPE')
    expect(svg).not.toContain('<b>')
  })
})
