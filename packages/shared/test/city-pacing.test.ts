import { describe, expect, test } from 'vitest'
import { cameraMode, initialPacer, mergeCaption, pace, BURST_WINDOW_MS } from '../src/city/pacing'
import type { CityScene, SceneKind } from '../src/city/scenes'

let n = 0
const sc = (kind: SceneKind, at = 'shop:a', caption = 'c'): CityScene => ({ stepIds: [`s${++n}`], kind, at, overlay: 'none', caption, count: 1 })

describe('pace', () => {
  test('a burst of reads leaves one playing and one waiting that stands for the rest', () => {
    const scenes = Array.from({ length: 300 }, () => sc('blueprint'))
    const s = pace(initialPacer, { type: 'arrive', scenes, t: 0 })
    expect(s.playing?.count).toBe(1)
    expect(s.waiting?.count).toBe(299)
    expect(s.waiting?.stepIds).toHaveLength(299)
    expect(s.waiting?.caption).toBe('Reading 299 files')
  })
  test('a different kind replaces what was waiting', () => {
    let s = pace(initialPacer, { type: 'arrive', scenes: [sc('blueprint'), sc('blueprint'), sc('bricks')], t: 0 })
    expect(s.waiting?.kind).toBe('bricks')
    s = pace(s, { type: 'arrive', scenes: [sc('inspect')], t: 1 })
    expect(s.waiting?.kind).toBe('inspect')
  })
  test('done plays what was waiting, then nothing', () => {
    let s = pace(initialPacer, { type: 'arrive', scenes: [sc('blueprint'), sc('bricks')], t: 0 })
    s = pace(s, { type: 'done', t: 1 })
    expect(s.playing?.kind).toBe('bricks')
    expect(s.waiting).toBeNull()
    s = pace(s, { type: 'done', t: 2 })
    expect(s.playing).toBeNull()
  })
  test('catching up replaces both with the newest', () => {
    let s = pace(initialPacer, { type: 'arrive', scenes: [sc('blueprint'), sc('bricks')], t: 0 })
    const last = sc('photo')
    s = pace(s, { type: 'catchUp', scene: last, t: 1 })
    expect(s.playing).toBe(last)
    expect(s.waiting).toBeNull()
  })
})

describe('cameraMode', () => {
  test('follows one spot at a normal pace', () => {
    const s = pace(initialPacer, { type: 'arrive', scenes: [sc('bricks', 'shop:a')], t: 0 })
    expect(cameraMode(s, 10)).toEqual({ mode: 'follow', at: 'shop:a' })
  })
  test('zooms out over three or more spots hit within the window', () => {
    let s = pace(initialPacer, { type: 'arrive', scenes: [sc('bricks', 'shop:a')], t: 0 })
    s = pace(s, { type: 'arrive', scenes: [sc('bricks', 'office')], t: 800 })
    s = pace(s, { type: 'arrive', scenes: [sc('delivery', 'yard')], t: 2000 })
    expect(cameraMode(s, 2000)).toEqual({ mode: 'overview', at: ['shop:a', 'office', 'yard'] })
  })
  test('back to following once things are quiet', () => {
    let s = pace(initialPacer, { type: 'arrive', scenes: [sc('bricks', 'shop:a'), sc('bricks', 'office'), sc('delivery', 'yard')], t: 0 })
    s = pace(s, { type: 'arrive', scenes: [sc('inspect', 'inspector')], t: BURST_WINDOW_MS + 100 })
    expect(cameraMode(s, BURST_WINDOW_MS + 100)).toEqual({ mode: 'follow', at: 'inspector' })
  })
})

test('merged captions read plainly', () => {
  expect(mergeCaption('blueprint', 10, 'x')).toBe('Reading 10 files')
  expect(mergeCaption('bricks', 3, 'x')).toBe('Making 3 new files')
  expect(mergeCaption('scaffold', 4, 'x')).toBe('Changing 4 files')
  expect(mergeCaption('inspect', 1, 'Running the tests')).toBe('Running the tests')
  for (const k of ['blueprint', 'bricks', 'scaffold', 'paint', 'delivery', 'toolbox', 'library'] as SceneKind[]) expect(mergeCaption(k, 5, 'x')).not.toMatch(/—/)
})
