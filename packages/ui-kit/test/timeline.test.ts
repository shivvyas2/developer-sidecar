import { describe, expect, test } from 'vitest'
import type { SceneSpec } from '@sidecar/shared'
import { SAMPLE_SCENES, scenes } from '../src/catalog'
import { ACTOR_HOME, LANE_Y, PLACE_AT } from '../src/layout'
import { compile, frameAt } from '../src/timeline'
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

describe('frameAt', () => {
  const tl = compile(connect)
  test('t=0: Claude is home and idle; the service is placed with its label', () => {
    const f = frameAt(connect, tl, 0)
    expect(f.actors).toEqual([expect.objectContaining({ id: 'claude', ...ACTOR_HOME.claude })])
    expect(f.places).toEqual([{ id: 'service', ...PLACE_AT.service, label: 'Stripe' }])
    expect(f.fx).toEqual([])
  })
  test('mid-walk Claude is between home and the service, walking', () => {
    const a = frameAt(connect, tl, BEAT_MS.walkTo / 2).actors[0]!
    expect(a.pose).toBe('walk')
    expect(a.x).toBeGreaterThan(ACTOR_HOME.claude.x)
    expect(a.x).toBeLessThan(PLACE_AT.service.x)
  })
  test('during plugCable the cable grows; after it, it stays at full length', () => {
    const mid = frameAt(connect, tl, BEAT_MS.walkTo + BEAT_MS.plugCable / 2)
    expect(mid.actors[0]!.pose).toBe('plugCable')
    const cable = mid.props.find((p) => p.kind === 'cable')!
    expect(cable.p).toBeGreaterThan(0)
    expect(cable.p).toBeLessThan(1)
    const end = frameAt(connect, tl, tl.duration)
    expect(end.props.find((p) => p.kind === 'cable')!.p).toBe(1)
    expect(end.actors[0]!.pose).toBe('idle')
  })
  test('the actor stands left of the place on the walking lane, facing it', () => {
    const a = frameAt(connect, tl, tl.duration).actors[0]!
    expect(a.y).toBe(LANE_Y)
    expect(a.x).toBeLessThan(PLACE_AT.service.x)
    expect(a.facing).toBe(1)
  })
  test('sparkle disappears once finished; success persists', () => {
    expect(frameAt(connect, tl, tl.duration).fx).toEqual([])
    const ok = scenes.inspect('x', false)
    const okTl = compile(ok)
    expect(frameAt(ok, okTl, okTl.duration).fx).toEqual([expect.objectContaining({ id: 'success', p: 1 })])
  })
  test('the town adds places that are not in the cast', () => {
    const f = frameAt(connect, tl, 0, { town: { places: ['app', 'database'], labels: {}, appFloors: 2 } })
    expect(f.places.map((p) => p.id).sort()).toEqual(['app', 'database', 'service'])
  })
  test('the same inputs always give the same frame', () => {
    for (const s of SAMPLE_SCENES) {
      const t = compile(s.spec)
      expect(frameAt(s.spec, t, 1234)).toEqual(frameAt(s.spec, t, 1234))
    }
  })
})

describe('frameAt robustness (Review Focus 3)', () => {
  const odd: SceneSpec[] = [
    { scene: 'empty', cast: [], beats: [], caption: '' },
    { scene: 'nowhere', cast: ['claude'], beats: [{ actor: 'claude', do: 'walkTo', to: 'moon' }, { fx: 'success', at: 'moon' }], caption: '' },
    { scene: 'uncast', cast: [], beats: [{ actor: 'helper', do: 'plugCable', to: 'database' }], caption: '' },
    { scene: 'to-actor', cast: ['you', 'claude'], beats: [{ actor: 'claude', do: 'hand', to: 'you' }], caption: '' },
  ]
  test.each(odd.map((s) => [s.scene, s] as const))('%s renders at any t without throwing', (_n, s) => {
    const tl = compile(s)
    for (const t of [-100, 0, 500, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const f = frameAt(s, tl, t)
      for (const a of f.actors) expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true)
    }
  })
  test('an actor used only in beats is still drawn; an unknown target leaves it in place', () => {
    const [, nowhere, uncast] = odd
    expect(frameAt(uncast!, compile(uncast!), 1e9).actors.map((a) => a.id)).toEqual(['helper'])
    const a = frameAt(nowhere!, compile(nowhere!), 1e9).actors[0]!
    expect([a.x, a.y]).toEqual([ACTOR_HOME.claude.x, ACTOR_HOME.claude.y])
  })
})
