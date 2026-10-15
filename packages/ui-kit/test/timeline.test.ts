import { describe, expect, test } from 'vitest'
import { scenes } from '../src/catalog'
import { compile } from '../src/timeline'
import { BEAT_MS, FX_MS, HOLD_MS } from '../src/tokens'

const connect = scenes.connect('Connecting to Stripe', 'Stripe', false)

describe('compile', () => {
  test('beats run back to back, then a hold', () => {
    const tl = compile(connect)
    expect(tl.beats.map((b) => [b.start, b.end])).toEqual([
      [0, BEAT_MS.walkTo],
      [BEAT_MS.walkTo, BEAT_MS.walkTo + BEAT_MS.plugCable],
      [BEAT_MS.walkTo + BEAT_MS.plugCable, BEAT_MS.walkTo + BEAT_MS.plugCable + FX_MS],
    ])
    expect(tl.duration).toBe(BEAT_MS.walkTo + BEAT_MS.plugCable + FX_MS + HOLD_MS)
  })
  test('an empty scene still lasts HOLD_MS', () => {
    expect(compile({ scene: 'x', cast: [], beats: [], caption: '' }).duration).toBe(HOLD_MS)
  })
})
