import { describe, expect, test } from 'vitest'
import { SAMPLE_SCENES, scenes } from '../src/catalog'
import { render } from '../src/render'
import { ANIMATORS, animatorFor } from '../src/scene/animators'
import { makeCtx, type Readout } from '../src/scene/context'
import { fmtTokens } from '../src/format'
import { ARC, STRIP_Y } from '../src/scene/frame'
import { FRAMED, SLOTS, drawerCards, slotsFor } from '../src/scene/layout'
import { compile } from '../src/timeline'
import { wellFormed } from './well-formed'

const ids = [...new Set(SAMPLE_SCENES.map((s) => s.spec.scene))]
const end = (spec: Parameters<typeof compile>[0]) => compile(spec).duration
const readout: Readout = { step: 7, files: 3, checks: 'pass', status: 'ALL GOOD', light: 'ok', now: 'EDIT · AUTH.TS', elapsed: '00:42', live: false }

describe('animators', () => {
  test('every catalog scene id has its own animator', () => {
    expect(ids).toHaveLength(14)
    for (const id of ids) {
      expect(ANIMATORS[id], id).toBeTypeOf('function')
      expect(animatorFor(id)).toBe(ANIMATORS[id])
    }
  })

  test('an unknown scene id falls back to the generic animator', () => {
    expect(animatorFor('mystery')).toBe(ANIMATORS.thinking)
    const spec = { scene: 'mystery', cast: [], beats: [], caption: '?' }
    expect(() => render(spec, 500)).not.toThrow()
    expect(render(spec, 500)).toContain('sk-hand')
  })

  test.each(ids.map((id) => [id] as const))('%s draws something of its own at every time (Review Focus 1)', (id) => {
    const spec = SAMPLE_SCENES.find((s) => s.spec.scene === id)!.spec
    const tl = compile(spec)
    for (const t of [0, tl.duration / 2, tl.duration]) {
      for (const frame of [false, true]) {
        const out = ANIMATORS[id]!(makeCtx(spec, tl, t, { frame }))
        wellFormed(out)
        expect(out).toMatch(/<(polygon|rect|path|circle)/)
      }
    }
    expect(render(spec, tl.duration, {}).replace(/^[\s\S]*?class="sk-grid"[^>]*\/>/, '')).toMatch(/<polygon|<rect/)
  })

  test('the failed flag reaches the animators: a failed connect ends with an accent cross', () => {
    const bad = scenes.connect('Connecting to Stripe', 'Stripe', true)
    const good = scenes.connect('Connecting to Stripe', 'Stripe', false)
    expect(makeCtx(bad, compile(bad), 0, {}).failed).toBe(true)
    expect(makeCtx(good, compile(good), 0, {}).failed).toBe(false)
    expect(render(bad, end(bad))).toMatch(/fill="var\(--sk-accent[^"]*"[^>]*>✕</)
    expect(render(good, end(good))).not.toContain('✕')
  })

  test('test and install show their outcome only at the end', () => {
    const ok = scenes.inspect('x', false), bad = scenes.inspect('x', true)
    expect(render(ok, end(ok))).toContain('sk-dial--ok')
    expect(render(bad, end(bad))).toContain('sk-dial--fail')
    expect(render(bad, 0)).not.toContain('sk-dial--fail')
    const inst = scenes.toolbox('x', true)
    expect(render(inst, end(inst))).toContain('sk-dial--fail')
  })

  test('progress p runs 0..1 over the beats, before the hold, and clamps odd times', () => {
    const spec = scenes.read('x')
    const tl = compile(spec)
    const active = tl.beats.at(-1)!.end
    expect(makeCtx(spec, tl, 0, {}).p).toBe(0)
    expect(makeCtx(spec, tl, active / 2, {}).p).toBeCloseTo(0.5)
    expect(makeCtx(spec, tl, active, {}).p).toBe(1)
    expect(makeCtx(spec, tl, tl.duration, {}).p).toBe(1)
    expect(makeCtx(spec, tl, Number.NaN, {}).p).toBe(0)
    expect(makeCtx(spec, tl, -5, {}).beatP(0)).toBe(0)
    expect(makeCtx(spec, tl, 1e9, {}).beatP(1)).toBe(1)
    expect(makeCtx(spec, tl, 1e9, {}).beatP(9)).toBe(0)
  })

  test('the user prompt is typed out, escaped', () => {
    const spec = scenes.prompt('add <b>checkout</b>')
    const svg = render(spec, end(spec))
    expect(svg).toContain('add &lt;b&gt;checkout')
    expect(svg).not.toContain('<b>')
  })
})

describe('frame', () => {
  test('frame: true draws the header, the readout panel with the padded step and the status strip', () => {
    const spec = scenes.bolt('Changing auth.ts')
    const svg = render(spec, 400, { frame: true, readout })
    for (const s of ['DEVELOPER SIDECAR', 'STEP', '007', 'MADE', '03', 'CHECKS', 'PASS', 'STATUS', 'ALL GOOD', 'sk-light--ok', 'NOW', 'ELAPSED', '00:42', 'REPLAY', 'STEP 007 · Changing auth.ts', 'sk-session-arc', 'sk-readout', 'sk-status-strip']) {
      expect(svg, s).toContain(s)
    }
    expect(render(spec, 400, { frame: true, readout: { ...readout, live: true } })).toContain('LIVE')
  })

  test('without the frame there is no header, panel or strip', () => {
    const svg = render(scenes.bolt('x'), 400)
    for (const s of ['DEVELOPER SIDECAR', 'sk-readout', 'sk-status-strip', 'sk-session-arc']) expect(svg).not.toContain(s)
  })

  test('frame values are escaped', () => {
    const svg = render(scenes.bolt('x'), 400, { frame: true, readout: { ...readout, now: '<b>now</b>', elapsed: '<i>', project: '<p>' } })
    expect(svg).not.toMatch(/<b>|<i>|<p>/)
    expect(svg).toContain('&lt;b&gt;')
  })

  test('a frame without a readout still renders', () => {
    const svg = render(scenes.bolt('x'), 400, { frame: true })
    wellFormed(svg)
    expect(svg).toContain('000')
  })

  test('with a project the header is the project line only; the page already names the product', () => {
    const svg = render(scenes.bolt('x'), 400, { frame: true, readout: { ...readout, project: 'shop-app' } })
    expect(svg).toContain('>SHOP-APP<')
    expect(svg).not.toContain('SHEET')
    expect(svg).not.toContain('DEVELOPER SIDECAR')
  })

  test('the session arc clears the framed dial and stays above the status strip', () => {
    const d = FRAMED.dial
    expect(Math.hypot(d.c.x - ARC.c.x, d.c.y - ARC.c.y)).toBeGreaterThan(ARC.r + d.r + 12)
    for (const session of [0, 0.5, 1]) {
      const svg = render(scenes.bolt('x'), 400, { frame: true, readout: { ...readout, session } })
      const arc = svg.match(/<g class="sk-session-arc">[\s\S]*?<\/g>/)![0]
      const ys = [...arc.matchAll(/\b(?:y1|y2|cy)="([\d.-]+)"/g)].map((m) => Number(m[1]))
      for (const m of arc.matchAll(/ d="([^"]+)"/g)) ys.push(...[...m[1]!.matchAll(/,([\d.-]+)/g)].map((p) => Number(p[1])))
      expect(ys.length).toBeGreaterThan(100)
      for (const y of ys) expect(y).toBeLessThan(STRIP_Y)
      expect(arc).not.toMatch(/<circle[^>]*r="180"/)
    }
  })

  test('the drawer copes with non-finite or fractional file counts', () => {
    const spec = scenes.bolt('Creating users.ts')
    for (const files of [Number.NaN, Infinity, -Infinity, -3, 4.7]) {
      const ctx = makeCtx(spec, compile(spec), 0, { frame: true, readout: { ...readout, files } })
      const n = drawerCards(ctx).length
      expect(Number.isInteger(n), String(files)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(6)
      for (const s of SAMPLE_SCENES) {
        wellFormed(render(s.spec, end(s.spec) / 2, { frame: true, readout: { ...readout, files }, town: { places: ['bookshelf'], labels: {}, appFloors: 2 } }))
      }
    }
  })

  test('tokens read like 4.3k', () => {
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(950)).toBe('950')
    expect(fmtTokens(4300)).toBe('4.3k')
    expect(fmtTokens(12000)).toBe('12k')
    expect(fmtTokens(2_500_000)).toBe('2.5M')
    expect(fmtTokens(Number.NaN)).toBe('0')
    expect(fmtTokens(-4)).toBe('0')
    expect(fmtTokens(999_999)).toBe('1M')
  })
})

describe('layout', () => {
  test('the sheet slots match the brief; the frame moves the dial out from under the readout panel', () => {
    expect(SLOTS.cloud).toEqual({ x: 470, y: 70 })
    expect(SLOTS.drawer).toEqual({ at: { x: 450, y: 196 }, w: 160 })
    expect(SLOTS.dial).toEqual({ c: { x: 560, y: 92 }, r: 26 })
    expect(SLOTS.hand).toEqual({ x: 330, y: 150 })
    expect(SLOTS.world).toEqual({ service: { x: 95, y: -12 }, data: { x: -50, y: 48 }, auth: { x: 62, y: 72 } })
    const f = slotsFor(true)
    expect(f.panel).toEqual({ at: { x: 440, y: 20 }, w: 178 })
    const r = f.dial.r + 12
    const inPanel = f.dial.c.x + r > 440 && f.dial.c.y - r < 20 + 96
    expect(inPanel).toBe(false)
  })
})
