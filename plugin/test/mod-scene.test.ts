import { expect, test } from 'vitest'
import type { FeedStep } from '@sidecar/shared'
import { SAMPLE_SCENES } from '@sidecar/ui-kit/catalog'
import { paneScene, SVG_LIMIT, themed } from '../src/mod/scene'

const readout = { step: 1, files: 0, tokens: 0, now: 'INSTALL', elapsed: '00:00', live: true }
const step = (spec: unknown, status: FeedStep['status'] = 'ok'): FeedStep => ({
  id: 's1', sessionId: 'S1', seq: 1, toolName: 'Bash', input: {}, startedAt: 0, status,
  category: 'install', caption: 'c', techLabel: 'Bash: x', scene: spec,
} as FeedStep)

test('themed embeds the theme so dark mode works with no page stylesheet', () => {
  const out = themed('<svg viewBox="0 0 1 1"><rect/></svg>')
  expect(out.startsWith('<svg viewBox="0 0 1 1"><style>')).toBe(true)
  expect(out).toContain('prefers-color-scheme: dark')
})

test('every sample scene fits the engine limit, framed and themed', () => {
  for (const { spec } of SAMPLE_SCENES) {
    for (const t of [0, 1500, 1e9]) {
      const out = paneScene([step(spec)], readout, t)!
      expect(out.svg.length).toBeLessThan(SVG_LIMIT)
      expect(out.svg).toContain('<style>')
    }
  }
})

test('plays until the timeline ends, then holds still', () => {
  const spec = SAMPLE_SCENES[0]!.spec
  expect(paneScene([step(spec)], readout, 0)!.playing).toBe(true)
  expect(paneScene([step(spec)], readout, 1e9)!.playing).toBe(false)
  expect(paneScene([step(spec)], readout, 1e9)!.remainingMs).toBe(0)
  expect(paneScene([step(spec)], readout, 100)!.remainingMs).toBe(paneScene([step(spec)], readout, 0)!.remainingMs - 100)
})

test('a negative clock reads as the start', () => {
  const spec = SAMPLE_SCENES[0]!.spec
  expect(paneScene([step(spec)], readout, -50)!.svg).toBe(paneScene([step(spec)], readout, 0)!.svg)
})

test('a malformed scene draws no SVG and never throws', () => {
  expect(paneScene([step({ scene: 42 })], readout, 0)).toBeUndefined()
  expect(paneScene([step(undefined)], readout, 0)).toBeUndefined()
  expect(paneScene([], readout, 0)).toBeUndefined()
})

test('a malformed earlier step does not hide the latest scene', () => {
  const spec = SAMPLE_SCENES[0]!.spec
  const bad = { ...step({ scene: 'x', cast: null, beats: [], caption: 'c' }), id: 's0' }
  expect(paneScene([bad, step(spec)], readout, 0)).toBeDefined()
})
