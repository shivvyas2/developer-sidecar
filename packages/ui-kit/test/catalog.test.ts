import { expect, test } from 'vitest'
import { SceneSpecSchema } from '@sidecar/shared'
import { SAMPLE_SCENES, scenes } from '../src/catalog'

test('there is a sample for every builder, and sample names are unique', () => {
  const sampled = new Set(SAMPLE_SCENES.map((s) => s.spec.scene))
  const built = new Set(Object.values(scenes).map((b) => (b as unknown as (c: string) => { scene: string })('x').scene))
  expect(sampled).toEqual(built)
  expect(new Set(SAMPLE_SCENES.map((s) => s.name)).size).toBe(SAMPLE_SCENES.length)
})

test('every sample is a valid SceneSpec', () => {
  for (const s of SAMPLE_SCENES) expect(SceneSpecSchema.safeParse(s.spec).success, s.name).toBe(true)
})
