import * as THREE from 'three'
import { cached, canvasTex, col, noise, pick, rand, rep, std } from './core'

/** Painted, textured surfaces in the reference palette: warm, muted, a little grimy. Made once, on first use. */

function make() {
  const grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9db474'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 50; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(80,110,55,.16)' : 'rgba(190,200,130,.16)'; g.beginPath(); g.ellipse(rand() * w, rand() * h, 10 + rand() * 34, 6 + rand() * 22, rand() * 3, 0, 7); g.fill() }
    noise(g, w, h, 3000, ['#8fa968', '#abc183', '#86a061', '#b6c98e'])
  }, 22, 22)
  const earth = canvasTex(128, 64, (g, w) => {
    let y = 0
    for (const [c, hh] of [['#9db474', 5], ['#8a6a48', 12], ['#7b5c3e', 14], ['#6c5038', 16], ['#5a4330', 17]] as const) { g.fillStyle = c; g.fillRect(0, y, w, hh); y += hh }
    noise(g, w, 64, 600, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.07)'])
  }, 12, 1)
  const dirt = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#9a7651'; g.fillRect(0, 0, w, h); noise(g, w, h, 1400, ['#8a6743', '#a98560', '#7c5c3b', '#b59570'], 1, 4) }, 2, 2)
  const asphalt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#56585d'; g.fillRect(0, 0, w, h)
    noise(g, w, h, 5000, ['#4c4e53', '#606267', '#46484c', '#6a6c70'], 1, 2)
    g.strokeStyle = 'rgba(30,30,32,.45)'
    for (let i = 0; i < 7; i++) { g.beginPath(); let x = rand() * w, y = rand() * h; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += rand() * 22 - 11; y += rand() * 22 - 11; g.lineTo(x, y) } g.stroke() }
  })
  const pavers = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#b3ab9c'; g.fillRect(0, 0, w, h)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 196 + rand() * 18 | 0; g.fillStyle = `rgb(${v},${v - 6},${v - 18})`; g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14) }
    noise(g, w, h, 160, ['rgba(0,0,0,.08)'])
  })
  const concrete = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#bdb9b0'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, ['#b0aca3', '#c9c5bc', '#a59f95', '#d3cfc6'], 1, 3) })
  const brick = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#cdbfa8'; g.fillRect(0, 0, w, h)
    for (let r = 0; r < 4; r++) for (let x = -32; x < w + 32; x += 32) { g.fillStyle = pick(['#b65e3e', '#a8553a', '#c26a48', '#9b4c33', '#b9643f']); g.fillRect(x + (r % 2) * 16 + 1.5, r * 16 + 1.5, 29, 13) }
    noise(g, w, h, 200, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)'])
  })
  const corr = canvasTex(64, 64, (g, w, h) => {
    for (let x = 0; x < w; x++) { const v = Math.sin(x / w * Math.PI * 10) * 0.5 + 0.5; const c = 128 + v * 52 | 0; g.fillStyle = `rgb(${c},${c},${c - 4})`; g.fillRect(x, 0, 1, h) }
    noise(g, w, h, 260, ['rgba(110,80,50,.18)', 'rgba(60,60,60,.12)'], 1, 4)
  })
  const tiles = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8f432e'; g.fillRect(0, 0, w, h)
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const x = c * 16, y = r * 16, b = [196, 98, 64].map((v) => v + rand() * 26 - 13)
      const gr = g.createLinearGradient(x, 0, x + 16, 0)
      gr.addColorStop(0, `rgb(${b.map((v) => v * 0.72 | 0).join(',')})`); gr.addColorStop(0.5, `rgb(${b.map((v) => v | 0).join(',')})`); gr.addColorStop(1, `rgb(${b.map((v) => v * 0.66 | 0).join(',')})`)
      g.fillStyle = gr; g.fillRect(x + 1, y, 14, 14)
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y + 13, 16, 3)
    }
  })
  const glass = canvasTex(32, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#d5e8f1'); gr.addColorStop(0.45, '#86a9bd'); gr.addColorStop(1, '#4f6f84')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(3, h); g.lineTo(11, h); g.lineTo(w, 9); g.lineTo(w, 1); g.closePath(); g.fill()
  })
  const rollup = canvasTex(32, 64, (g, w, h) => { for (let y = 0; y < h; y += 4) { g.fillStyle = '#a3a8aa'; g.fillRect(0, y, w, 3); g.fillStyle = '#737a7e'; g.fillRect(0, y + 3, w, 1) } })
  const leaf = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#62894a'; g.fillRect(0, 0, w, h); noise(g, w, h, 700, ['#557a3f', '#759c58', '#4a6d37', '#86ab66'], 2, 5) })
  const wood = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#9b7350'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(60,40,20,.25)'; g.fillRect(0, y, w, 1) } noise(g, w, h, 200, ['rgba(60,40,20,.15)']) })
  const all = { grass, earth, dirt, asphalt, pavers, concrete, brick, corr, tiles, glass, rollup, leaf, wood }
  for (const t of Object.values(all)) cached(t)
  return all
}

let made: ReturnType<typeof make> | null = null
export const T = () => (made ??= make())

export const stripeTex = (a: string, b: string) => canvasTex(64, 16, (g, _w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 8, 0, 8, h) } })

const plasterCache = new Map<string, THREE.CanvasTexture>()
export function plaster(color: string) {
  if (plasterCache.has(color)) return plasterCache.get(color)!
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h)
    noise(g, w, h, 1100, ['rgba(0,0,0,.035)', 'rgba(255,255,255,.07)'], 1, 3)
    const gr = g.createLinearGradient(0, h * 0.72, 0, h); gr.addColorStop(0, 'rgba(70,52,34,0)'); gr.addColorStop(1, 'rgba(70,52,34,.26)')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 7; i++) {
      const x = rand() * w, gg = g.createLinearGradient(0, 0, 0, h * 0.5)
      gg.addColorStop(0, 'rgba(70,60,50,.14)'); gg.addColorStop(1, 'rgba(70,60,50,0)')
      g.fillStyle = gg; g.fillRect(x, 0, 1.5 + rand() * 4, h * (0.15 + rand() * 0.4))
    }
  })
  plasterCache.set(color, cached(t))
  return t
}
const plasterMats = new Map<string, THREE.MeshStandardMaterial>()
export const plasterMat = (color: string) => { if (!plasterMats.has(color)) plasterMats.set(color, cached(std({ map: plaster(color) }))); return plasterMats.get(color)! }

let mats: ReturnType<typeof makeMats> | null = null
function makeMats() {
  const t = T()
  return {
    glass: std({ map: t.glass, roughness: 0.25, metalness: 0.15 }),
    litGlass: std({ color: 0xffe2a0, emissive: 0xffc870, emissiveIntensity: 0.9 }),
    dark: col(0x34353b), white: col(0xf2eee6), trimW: col(0xf4efe4), trimG: col(0x3e6b4c), trimB: col(0x3d5a73),
    sill: col(0xd9d2c4), wood: std({ map: t.wood }), trunk: col(0x7a5a3d), wire: col(0x2b2b2e),
    metal: std({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.4 }),
    concrete: std({ map: rep(t.concrete, 2, 2) }), roofFlat: col(0xa49f96), skin: col(0xe0b48f), rebar: col(0x5b4a3c),
    leaves: [0x6f9a4f, 0x5e8a43, 0x86ab5f, 0x4f7a3a, 0x7ea457].map((c) => std({ color: c, flatShading: true })),
    cypress: std({ color: 0x3f5f36, flatShading: true }),
    hedge: std({ map: rep(t.leaf, 2, 1) }),
    tiles: std({ map: rep(t.tiles, 0.7, 0.7) }),
    corr: std({ map: rep(t.corr, 1.2, 0.8), roughness: 0.55, metalness: 0.3 }),
    brick: (rx: number, ry: number) => std({ map: rep(t.brick, rx, ry) }),
    smoke: col(0x5e5a56),
  }
}
export const M = () => {
  if (!mats) {
    mats = makeMats()
    for (const v of Object.values(mats)) for (const m of Array.isArray(v) ? v : [v]) if (m instanceof THREE.Material) cached(m)
  }
  return mats
}
