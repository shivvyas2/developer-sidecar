import { describe, expect, test } from 'vitest'
import { SceneSpecSchema, type SceneSpec } from '@sidecar/shared'
import { SAMPLE_SCENES, forStatus, scenes } from '../src/catalog'

test('there is a sample for every builder, and sample names are unique', () => {
  const sampled = new Set(SAMPLE_SCENES.map((s) => s.spec.scene))
  const built = new Set(Object.values(scenes).map((b) => (b as unknown as (c: string) => { scene: string })('x').scene))
  expect(sampled).toEqual(built)
  expect(new Set(SAMPLE_SCENES.map((s) => s.name)).size).toBe(SAMPLE_SCENES.length)
})

test('every sample is a valid SceneSpec', () => {
  for (const s of SAMPLE_SCENES) expect(SceneSpecSchema.safeParse(s.spec).success, s.name).toBe(true)
})

describe('forStatus', () => {
  const kinds = (s: SceneSpec) => s.beats.flatMap((b) => ('fx' in b ? [b.fx] : []))
  test('running drops success/error but keeps the other fx', () => {
    expect(kinds(forStatus(scenes.launch('x', false), 'running'))).toEqual([])
    expect(kinds(forStatus(scenes.run('x', true), 'interrupted'))).toEqual([])
    expect(kinds(forStatus(scenes.gadget('x'), 'running'))).toEqual(['sparkle'])
    expect(kinds(forStatus(scenes.thinking('x'), 'running'))).toEqual(['thinking'])
    expect(kinds(forStatus(scenes.prompt('x'), 'running'))).toEqual(['speech'])
  })
  test('ok and failed return the identical object', () => {
    const s = scenes.launch('x', false)
    expect(forStatus(s, 'ok')).toBe(s)
    expect(forStatus(s, 'failed')).toBe(s)
  })
})
