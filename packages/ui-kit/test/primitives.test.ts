import { describe, expect, test } from 'vitest'
import * as P from '../src/primitives'

/** Tags balance; no NaN/undefined; no raw hex in attributes. */
export function wellFormed(svg: string) {
  const opens = (svg.match(/<(?!\/)[a-z]+[^>]*?(?<!\/)>/gi) ?? []).length
  const closes = (svg.match(/<\/[a-z]+>/gi) ?? []).length
  expect(opens).toBe(closes)
  expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  expect(svg).not.toMatch(/="#[0-9a-f]{3,8}"/i)
}
const o = { x: 300, y: 200 }

describe('batch 1', () => {
  test('gridPaper', () => wellFormed(P.gridPaper(640, 360)))
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
