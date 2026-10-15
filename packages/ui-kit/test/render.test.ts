import { describe, expect, test } from 'vitest'
import type { SceneSpec } from '@sidecar/shared'
import { SAMPLE_SCENES, scenes } from '../src/catalog'
import { render, type Readout } from '../src/render'
import { compile } from '../src/timeline'
import { wellFormed } from './well-formed'

const READOUT: Readout = { step: 42, files: 6, tokens: 4300, now: 'INSTALL · STRIPE', elapsed: '02:14', live: true, session: 0.64, project: 'shop-app' }
const sample = (name: string) => SAMPLE_SCENES.find((s) => s.name === name)!.spec

describe('render', () => {
  test.each(SAMPLE_SCENES.map((s) => [s.name, s.spec] as const))('%s matches its snapshot at start, middle and end', (_n, spec) => {
    const d = compile(spec).duration
    for (const t of [0, Math.round(d / 2), d]) expect(render(spec, t)).toMatchSnapshot()
  })

  test.each(['create', 'install', 'external-failed'])('%s with the stage frame matches its snapshot', (name) => {
    const spec = sample(name)
    expect(render(spec, Math.round(compile(spec).duration / 2), { frame: true, readout: READOUT })).toMatchSnapshot()
  })

  test('every sample is well formed at start, middle and end, with and without the frame', () => {
    for (const s of SAMPLE_SCENES) {
      const d = compile(s.spec).duration
      for (const t of [0, d / 2, d]) for (const frame of [false, true]) wellFormed(render(s.spec, t, { frame, readout: READOUT }))
    }
  })

  test('is deterministic', () => {
    for (const s of SAMPLE_SCENES) expect(render(s.spec, 777)).toBe(render(s.spec, 777))
  })

  test('the caption becomes an accessible, escaped title', () => {
    const svg = render(scenes.thinking('Fixing <b> & "quotes"'), 0)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"')).toBe(true)
    expect(svg).toContain('<title>Fixing &lt;b&gt; &amp; &quot;quotes&quot;</title>')
    expect(svg).toContain('aria-label="Fixing &lt;b&gt; &amp; &quot;quotes&quot;"')
  })

  test('hostile labels never inject markup (Review Focus 1)', () => {
    const evil = '"><script>alert(1)</script><x y="'
    const svg = render(scenes.connect(evil, evil, false), 1e9, { town: { places: ['app', 'toolbox'], labels: { toolbox: evil }, appFloors: 1 } })
    expect(svg).not.toMatch(/<script|<x /)
    const framed = render(scenes.prompt(evil), 1e9, { frame: true, readout: { ...READOUT, now: evil, elapsed: evil, project: evil } })
    expect(framed).not.toMatch(/<script|<x /)
  })

  test('the town draws places outside the cast and grows Your App', () => {
    const one = render(scenes.read('x'), 0, { town: { places: ['app'], labels: {}, appFloors: 1 } })
    const four = render(scenes.read('x'), 0, { town: { places: ['app', 'cloud'], labels: {}, appFloors: 4 } })
    expect(one).toContain('sk-place--app')
    expect(four).toContain('sk-place--cloud')
    expect(four.length).toBeGreaterThan(one.length)
  })

  test('odd specs and times render without throwing (Review Focus 3)', () => {
    const odd: SceneSpec = { scene: 'odd', cast: [], beats: [{ actor: 'helper', do: 'launch', to: 'moon' }, { fx: 'error', at: '' }], caption: '' }
    for (const t of [Number.NaN, -1, 0, 1e12]) expect(render(odd, t)).toMatch(/^<svg[\s\S]*<\/svg>$/)
    for (const t of [Number.NaN, -1, 0, 1e12]) expect(render(odd, t, { frame: true })).toMatch(/^<svg[\s\S]*<\/svg>$/)
  })
})
