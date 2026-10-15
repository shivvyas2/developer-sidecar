import { describe, expect, test } from 'vitest'
import * as P from '../src/primitives'
import { fit } from '../src/primitives/text'
import { wellFormed } from './well-formed'


const o = { x: 300, y: 200 }

describe('batch 1', () => {
  test('gridPaper', () => wellFormed(P.gridPaper(640, 360)))
  test('gridPaper clamps non-finite and oversized sizes to the canvas', () => {
    const canvas = P.gridPaper(640, 360)
    for (const [w, h] of [[Infinity, 360], [640, Number.NaN], [-Infinity, Infinity], [1e9, 1e9]] as const) {
      expect(P.gridPaper(w, h)).toBe(canvas)
    }
    expect(P.gridPaper(-5, -5)).toBe(P.gridPaper(0, 0))
    wellFormed(P.gridPaper(160, 90, Number.NaN))
  })
  test('fit cuts by code points, never splitting a surrogate pair', () => {
    expect(fit('😀😀😀😀', 3)).toBe('😀😀…')
    expect(fit('😀😀😀', 3)).toBe('😀😀😀')
    expect(fit('ab<cd', 4)).toBe('ab&lt;…')
    expect(fit('😀😀😀😀', 3)).not.toMatch(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/u)
  })
  test.each(['app', 'service', 'data', 'auth', 'ok', 'paper'] as const)('isoBlock %s solid and dashed', (tone) => {
    wellFormed(P.isoBlock(o, { x: 0, y: 0, z: 0, w: 40, d: 30, h: 20 }, tone))
    const dashed = P.isoBlock(o, { x: 0, y: 0, z: 0, w: 40, d: 30, h: 20 }, tone, { dashed: true })
    expect(dashed).toContain('stroke-dasharray')
    expect(dashed).not.toContain('var(--sk-block')
  })
  test('isoStack clamps floors and dashes the building floor', () => {
    expect(P.isoStack(o, 99, {})).toBe(P.isoStack(o, 5, {}))
    expect(P.isoStack(o, 0, {})).toBe(P.isoStack(o, 1, {}))
    expect(P.isoStack(o, 3, { building: true })).toContain('stroke-dasharray')
  })
  test('callout can end its label at the leader, for labels left of what they point at', () => {
    const start = P.callout({ x: 100, y: 50 }, { x: 50, y: 20 }, 'YOUR APP', 'FLOOR 02')
    const end = P.callout({ x: 100, y: 50 }, { x: 50, y: 20 }, 'YOUR APP', 'FLOOR 02', { align: 'end' })
    wellFormed(end)
    expect(start).not.toContain('text-anchor')
    expect(end.match(/text-anchor="end"/g)).toHaveLength(2)
    expect(end).toContain('<text x="47"')
  })
  test('callout escapes and truncates', () => {
    const s = P.callout({ x: 1, y: 1 }, { x: 50, y: 20 }, '<script>' + 'x'.repeat(200), 'a & b')
    expect(s).not.toContain('<script>'); expect(s).toContain('&lt;script&gt;'); expect(s).toContain('&amp;'); expect(s).toContain('…')
    wellFormed(s)
  })
  test('connector draws partially and fully', () => {
    for (const p of [0, 0.5, 1]) wellFormed(P.connector({ x: 10, y: 10 }, { x: 200, y: 80 }, p))
    expect(P.connector({ x: 10, y: 10 }, { x: 200, y: 80 }, 0.5)).not.toBe(P.connector({ x: 10, y: 10 }, { x: 200, y: 80 }, 1))
  })
})

describe('batch 2: cards, drawer, stamp', () => {
  const at = { x: 40, y: 60 }
  const eight = Array.from({ length: 8 }, (_, i) => ({ num: String(94 + i), name: `file${i}.ts`, group: i === 2 || i === 6 }))

  test.each(['rest', 'lifted', 'inserting', 'editing'] as const)('indexCard %s is well formed', (state) => {
    wellFormed(P.indexCard(at, { num: '042', title: 'auth.ts', state, progress: 0.4 }))
  })
  test('indexCard editing strikes a bar and draws the accent rewrite', () => {
    const s = P.indexCard(at, { num: '042', title: 'auth.ts', state: 'editing', progress: 0.6 })
    expect(s).toContain('var(--sk-accent')
    expect(P.indexCard(at, { num: '042', title: 'auth.ts' })).not.toContain('var(--sk-accent')
  })
  test('indexCard fills the tab with ink unless at rest', () => {
    const rest = P.indexCard(at, { num: '042', title: 'a' })
    const lifted = P.indexCard(at, { num: '042', title: 'a', state: 'lifted' })
    expect(rest).not.toBe(lifted)
    expect(lifted).toMatch(/class="sk-card-tab"[^>]*fill="var\(--sk-ink/)
    expect(rest).toMatch(/class="sk-card-tab"[^>]*fill="var\(--sk-card/)
  })
  test('indexCard escapes and truncates the title', () => {
    const s = P.indexCard(at, { num: '<1>', title: '<img onerror=x>' + 'y'.repeat(200) })
    expect(s).not.toContain('<img'); expect(s).toContain('&lt;img'); expect(s).toContain('…')
    wellFormed(s)
  })

  test('tabSlots cycles 3 fixed columns, tab width is 30% and columns never overlap', () => {
    const slots = P.tabSlots(8, 360)
    expect(slots).toHaveLength(8)
    expect(new Set(slots.map((s) => s.x)).size).toBe(3)
    for (let i = 0; i + 3 < 8; i++) expect(slots[i + 3]!.x).toBe(slots[i]!.x)
    for (const s of slots) expect(s.w).toBeCloseTo(108)
    const cols = [...new Set(slots.map((s) => s.x))].sort((a, b) => a - b)
    for (let i = 1; i < cols.length; i++) expect(cols[i]! - cols[i - 1]!).toBeGreaterThanOrEqual(108 - 1e-9)
    expect(cols[2]! + 108).toBeLessThanOrEqual(360 - 9)
  })
  test('cardDrawer keeps every tab inside its card edge', () => {
    for (const width of [120, 260, 360, 420]) {
      const s = P.cardDrawer(at, { cards: eight, label: 'x', width })
      const tabs = [...s.matchAll(/class="sk-drawer-tab[^"]*" d="M[\d.]+,[\d.]+L[^H]+H[^L]+L([\d.]+),/g)].map((m) => Number(m[1]))
      const edges = [...s.matchAll(/H([\d.]+)Q([\d.]+),[\d.]+ [\d.]+,[\d.]+V/g)].map((m) => Number(m[2]))
      expect(tabs).toHaveLength(8)
      for (const r of tabs) expect(r).toBeLessThanOrEqual(Math.min(...edges) - 4 + 1e-9)
    }
  })
  test('cardDrawer draws 8 tabs at 3 x positions, black group tabs and the label', () => {
    const s = P.cardDrawer(at, { cards: eight, label: 'src/' })
    wellFormed(s)
    const xs = [...s.matchAll(/class="sk-drawer-tab[^"]*" d="M([\d.]+),/g)].map((m) => m[1])
    expect(xs).toHaveLength(8)
    expect(new Set(xs).size).toBe(3)
    expect((s.match(/sk-drawer-tab--group/g) ?? []).length).toBe(2)
    expect(s).toContain('var(--sk-label')
    // the pill's text uses onLabel (ink in light, paper in dark), never plain ink
    expect(s).toMatch(/fill="var\(--sk-onLabel, #111111\)"[^>]*>src\/</)
    expect(s).toContain('src/')
  })
  test('cardDrawer shows at most 8 card edges', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ num: String(i), name: `f${i}` }))
    const s = P.cardDrawer(at, { cards: many, label: 'x' })
    expect((s.match(/class="sk-drawer-tab/g) ?? []).length).toBe(8)
  })
  test('cardDrawer skips the lifted card', () => {
    const s = P.cardDrawer(at, { cards: eight, lifted: '97', label: 'src/' })
    expect(s).not.toContain('file3.ts')
    expect(s).toContain('file4.ts')
    expect((s.match(/class="sk-drawer-tab/g) ?? []).length).toBe(7)
  })
  test('cardDrawer escapes and truncates hostile names to fit the tab', () => {
    const name = '<script>alert(1)</script>' + 'z'.repeat(100)
    const s = P.cardDrawer(at, { cards: [{ num: '1', name }], label: '<b>&' })
    wellFormed(s)
    expect(s).not.toContain('<script>'); expect(s).not.toContain('<b>')
    expect(s).toContain('&lt;script'); expect(s).toContain('&amp;'); expect(s).toContain('…')
    const max = Math.floor((360 * 0.3 - 16) / 4.2)
    const shown = s.match(/>(&lt;script[^<]*)</)![1]!.replace(/&[a-z]+;/g, '_')
    expect(shown.length).toBeLessThanOrEqual(max)
  })

  test('stamp is well formed, rotated and escaped', () => {
    const s = P.stamp(at, 'SAVED 042')
    wellFormed(s)
    expect(s).toContain('rotate(-6)')
    expect(s).toContain('SAVED 042')
    expect(P.stamp(at, '<x>')).toContain('&lt;x&gt;')
  })
})

describe('batch 3: instruments', () => {
  const c = { x: 120, y: 120 }
  const accents = (s: string) => (s.match(/var\(--sk-accent/g) ?? []).length
  const progresses = [-1, 0, 0.5, 1, 2]

  test.each(progresses)('dial, sessionArc well formed at progress %s', (p) => {
    for (const state of ['run', 'ok', 'fail'] as const) {
      wellFormed(P.dial(c, 40, { progress: p, value: '042', title: 'step', unit: 'files', state }))
    }
    wellFormed(P.sessionArc(c, 100, p))
  })
  test('sessionArc with a floor draws only the ring above it', () => {
    const floor = 150
    const s = P.sessionArc(c, 100, 0.5, { floor })
    wellFormed(s)
    expect(s).not.toMatch(/<circle[^>]*r="100"/)
    const ring = s.match(/class="sk-arc-ring" d="M([\d.]+),([\d.]+)A100 100 0 1 1 ([\d.]+),([\d.]+)"/)
    expect(ring).not.toBeNull()
    const [, x0, y0, x1, y1] = ring!.map(Number)
    expect(y0).toBe(floor); expect(y1).toBe(floor)
    expect(x0! + x1!).toBeCloseTo(2 * c.x)
    // a floor below the circle keeps the whole ring
    expect(P.sessionArc(c, 100, 0.5, { floor: 999 })).toBe(P.sessionArc(c, 100, 0.5))
  })
  test('dial has no accent at 0 and all 49 ticks accent at 1', () => {
    expect(accents(P.dial(c, 40, { progress: 0, value: '0', title: 'x' }))).toBe(0)
    expect(accents(P.dial(c, 40, { progress: 1, value: '9', title: 'x' }))).toBe(49)
    expect(accents(P.dial(c, 40, { progress: 0.5, value: '9', title: 'x' }))).toBe(25)
  })
  test('dial clamps progress', () => {
    const d = (p: number) => P.dial(c, 40, { progress: p, value: '1', title: 'x' })
    expect(d(-1)).toBe(d(0)); expect(d(2)).toBe(d(1)); expect(d(Number.NaN)).toBe(d(0))
  })
  test('dial states: ok shows an ink check, fail an accent cross, both drop the value', () => {
    const ok = P.dial(c, 40, { progress: 1, value: 'QZQ', title: 'x', state: 'ok' })
    const fail = P.dial(c, 40, { progress: 0, value: 'QZQ', title: 'x', state: 'fail' })
    expect(ok).toContain('✓'); expect(ok).not.toContain('QZQ')
    expect(fail).toMatch(/fill="var\(--sk-accent[^"]*"[^>]*>✕</)
    expect(fail).not.toContain('QZQ')
    expect(accents(fail)).toBe(1)
  })
  test('dial escapes the value, title and unit', () => {
    const s = P.dial(c, 40, { progress: 0.2, value: '<b>', title: '<i>&', unit: '"u"' })
    wellFormed(s)
    expect(s).not.toMatch(/<b>|<i>/); expect(s).toContain('&lt;b&gt;'); expect(s).toContain('&amp;'); expect(s).toContain('&quot;')
  })

  test('readout is well formed, chamfered and escapes hostile text', () => {
    const fields = [{ k: 'STEP', v: '042', big: true }, { k: 'FILES', v: '06' }, { k: 'TOKENS', v: '4.3k' }]
    const s = P.readout({ x: 20, y: 20 }, 180, fields, { k: 'NOW', v: 'INSTALL · STRIPE' })
    wellFormed(s)
    expect(s).toContain('042'); expect(s).toContain('INSTALL · STRIPE'); expect(s).toContain('stroke-dasharray')
    expect(s).toContain('font-size="30"'); expect(s).toContain('font-size="20"')
    const bad = P.readout({ x: 0, y: 0 }, 180, [{ k: '<script>', v: '<img onerror=x>' }], { k: '&', v: '"><svg>' })
    wellFormed(bad)
    expect(bad).not.toMatch(/<script>|<img|<svg>/)
    expect(bad).toContain('&lt;script&gt;'); expect(bad).toContain('&lt;img'); expect(bad).toContain('&quot;&gt;&lt;svg&gt;')
    wellFormed(P.readout({ x: 0, y: 0 }, 120, []))
  })

  test('readout keeps long values inside the panel and spaces a big value from its neighbour', () => {
    const s = P.readout({ x: 0, y: 0 }, 180, [{ k: 'LONG', v: '123456789012345678901' }, { k: 'B', v: '9' }])
    expect(s).toContain('…')
    const xs = (r: string) => [...r.matchAll(/<text x="([\d.]+)"[^>]*font-family="'DotGothic16/g)].map((m) => Number(m[1]))
    const big = P.readout({ x: 0, y: 0 }, 180, [{ k: 'STEP', v: '042', big: true }, { k: 'FILES', v: '06' }, { k: 'TOKENS', v: '4.3k' }])
    const [a, b, c2] = xs(big)
    expect(b! - a!).toBeGreaterThanOrEqual(3 * 30 * 0.52 + 6)
    expect(c2! + 4 * 20 * 0.52).toBeLessThanOrEqual(180 - 12)
  })
  test('readout takes several note rows and grows to fit them', () => {
    const s = P.readout({ x: 0, y: 0 }, 178, [{ k: 'STEP', v: '042', big: true }], [{ k: 'NOW', v: 'A' }, { k: 'ELAPSED', v: '<02:14>' }])
    wellFormed(s)
    expect(s).toContain('ELAPSED'); expect(s).toContain('&lt;02:14&gt;')
    expect(s).toMatch(/v80h-178Z/)
    expect(P.readout({ x: 0, y: 0 }, 178, [], { k: 'NOW', v: 'A' })).toMatch(/v66h-178Z/)
  })
  test('a small dial moves its title below the ring', () => {
    const s = P.dial({ x: 100, y: 100 }, 22, { progress: 0.5, value: '64', title: 'install', unit: 'pct' })
    wellFormed(s)
    const y = Number(s.match(/<text x="100" y="([\d.]+)"[^>]*>INSTALL</)![1])
    expect(y).toBeGreaterThan(100 + 22 + 9)
  })
  test.each([0, 1, 2, 3, 9, -2])('indicatorRow has exactly lit accent fills (%s)', (lit) => {
    const s = P.indicatorRow({ x: 10, y: 10 }, ['LT', 'P', 'TC'], lit)
    wellFormed(s)
    expect((s.match(/fill="var\(--sk-accent/g) ?? []).length).toBe(Math.min(3, Math.max(0, lit)))
    expect(s).toContain('>TC<')
  })

  test('sessionArc: 121 ticks, accent up to progress', () => {
    const lines = (s: string) => (s.match(/<line /g) ?? []).length
    expect(lines(P.sessionArc(c, 100, 0)) - 1).toBe(121)
    expect(accents(P.sessionArc(c, 100, 0))).toBe(0)
    expect(accents(P.sessionArc(c, 100, 1))).toBe(121)
    expect(accents(P.sessionArc(c, 100, 0.6))).toBe(73)
    expect(P.sessionArc(c, 100, 2)).toBe(P.sessionArc(c, 100, 1))
  })

  test('statusStrip shows LIVE or REPLAY in an ink block and escapes the text', () => {
    const live = P.statusStrip({ x: 24, y: 340 }, 592, { text: 'STEP 042 · ADDING STRIPE', live: true })
    const replay = P.statusStrip({ x: 24, y: 340 }, 592, { text: '<b>x</b>' + 'y'.repeat(300), live: false })
    wellFormed(live); wellFormed(replay)
    expect(live).toContain('>LIVE<'); expect(live).toContain('STEP 042 · ADDING STRIPE'); expect(live).not.toContain('REPLAY')
    expect(replay).toContain('>REPLAY<'); expect(replay).not.toContain('<b>'); expect(replay).toContain('&lt;b&gt;'); expect(replay).toContain('…')
    expect(accents(live)).toBe(0)
  })
})

describe('batch 4: figures and tools', () => {
  const at = { x: 200, y: 160 }
  const accents = (s: string) => (s.match(/var\(--sk-accent/g) ?? []).length
  const poses = ['point', 'press', 'hold'] as const
  const holdings = [undefined, 'card', 'block', 'module'] as const
  const combos = poses.flatMap((pose) => holdings.flatMap((holding) =>
    ([1, -1] as const).flatMap((facing) => [1, 0.7].map((scale) => ({ pose, holding, facing, scale })))))

  test.each(combos)('hand $pose holding $holding facing $facing scale $scale is well formed', (h) => {
    const s = P.hand(at, h)
    wellFormed(s)
    expect(s).toContain('var(--sk-card')
    expect(s).toContain('stroke-width="1.1"')
    expect(s).toContain(`sk-hand--${h.pose}`)
  })
  test('hand is anchored at the fingertip and mirrors with facing', () => {
    const right = P.hand(at, { pose: 'point' })
    const left = P.hand(at, { pose: 'point', facing: -1 })
    expect(right).toContain('translate(200 160) scale(1 1)')
    expect(left).toContain('translate(200 160) scale(-1 1)')
    expect(P.hand(at, { pose: 'point', scale: 0.7 })).toContain('scale(0.7 0.7)')
  })
  test('poses differ and only hold draws what it holds', () => {
    const [pt, pr, ho] = poses.map((pose) => P.hand(at, { pose }))
    expect(pt).not.toBe(pr); expect(pr).not.toBe(ho)
    expect(P.hand(at, { pose: 'point', holding: 'block' })).toBe(pt)
    expect(P.hand(at, { pose: 'hold', holding: 'block' })).toContain('sk-block--service')
    expect(P.hand(at, { pose: 'hold', holding: 'card' })).toContain('sk-held--card')
    expect(P.hand(at, { pose: 'hold', holding: 'module' })).toContain('sk-module')
  })
  test('hand never uses the accent, except the held module dot', () => {
    for (const pose of poses) expect(accents(P.hand(at, { pose }))).toBe(0)
    expect(accents(P.hand(at, { pose: 'hold', holding: 'module' }))).toBe(1)
  })

  test.each([-1, 0, 0.5, 1, 2, Number.NaN])('helperHand at progress %s', (p) => {
    const s = P.helperHand(at, p)
    wellFormed(s)
    expect(s).toContain('scale(0.7 0.7)')
    expect(s).toContain('sk-dial')
  })
  test('helperHand dial follows progress', () => {
    expect(accents(P.helperHand(at, 0))).toBe(0)
    expect(accents(P.helperHand(at, 1))).toBe(49)
    expect(P.helperHand(at, 2)).toBe(P.helperHand(at, 1))
  })

  test('cursor escapes and truncates to 34 characters', () => {
    const s = P.cursor(at, '<script>alert("x")</script>' + 'y'.repeat(200))
    wellFormed(s)
    expect(s).not.toMatch(/<script>|<\/script>/)
    expect(s).toContain('&lt;script&gt;'); expect(s).toContain('&quot;'); expect(s).toContain('…')
    const text = s.match(/<text[^>]*>([^<]*)<\/text>/)![1]!
    const visible = text.replace(/&[a-z]+;|&#\d+;/g, '_')
    expect(visible.length).toBe(34)
  })
  test('cursor keeps a 30 character prompt whole and draws a 2px caret', () => {
    const q = 'add stripe checkout to my shop'
    const s = P.cursor(at, q)
    wellFormed(s)
    expect(s).toContain(`>${q}<`); expect(s).not.toContain('…')
    expect(s).toMatch(/<rect[^>]*width="2"[^>]*fill="var\(--sk-ink/)
    expect(s).toContain('font-size="7"')
  })
  test('cursor box grows with the text', () => {
    const w = (s: string) => Number(s.match(/class="sk-speech"[^>]*\swidth="([\d.]+)"/)![1])
    expect(w(P.cursor(at, 'hi there, add a page'))).toBeGreaterThan(w(P.cursor(at, 'hi')))
    expect(w(P.cursor(at, 'x'.repeat(500)))).toBe(w(P.cursor(at, 'x'.repeat(34))))
  })

  test('cloud, magnifier and instrumentModule are well formed and use the card fill', () => {
    for (const s of [P.cloud(at), P.magnifier(at), P.instrumentModule(at)]) {
      wellFormed(s)
      expect(s).toContain('var(--sk-card')
    }
    expect(accents(P.cloud(at))).toBe(0)
    expect(accents(P.magnifier(at))).toBe(0)
    expect(accents(P.instrumentModule(at))).toBe(1)
  })

  test.each([-1, 0, 0.5, 1, 2])('packageBlock at progress %s', (p) => {
    const s = P.packageBlock(at, p)
    wellFormed(s)
    expect(s).toContain('sk-block--service')
  })
  test('packageBlock: no accent at 0, a slit tape drawn with progress, clamped', () => {
    expect(accents(P.packageBlock(at, 0))).toBe(0)
    expect(accents(P.packageBlock(at, 1))).toBe(1)
    expect(P.packageBlock(at, 0.5)).not.toBe(P.packageBlock(at, 1))
    expect(P.packageBlock(at, 5)).toBe(P.packageBlock(at, 1))
    expect(P.packageBlock(at, -5)).toBe(P.packageBlock(at, 0))
  })
})
