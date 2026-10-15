import { describe, expect, test } from 'vitest'
import type { SceneSpec } from '@sidecar/shared'
import { SAMPLE_SCENES, scenes } from '../src/catalog'
import { render } from '../src/render'
import { compile } from '../src/timeline'

describe('render', () => {
  test.each(SAMPLE_SCENES.map((s) => [s.name, s.spec] as const))('%s matches its snapshot at start, middle and end', (_n, spec) => {
    const d = compile(spec).duration
    for (const t of [0, Math.round(d / 2), d]) expect(render(spec, t)).toMatchSnapshot()
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
  })
})
