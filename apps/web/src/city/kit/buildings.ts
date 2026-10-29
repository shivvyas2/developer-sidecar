import * as THREE from 'three'
import type { Building, Finish } from '@sidecar/shared'
import { at, bake, ball, box, col, cyl, grp, pick, rand, rep, shade, signBoard, std } from './core'
import { ac, crate, gableRoof, groundPatch, hedge, parapet, person, pot, tree, win } from './props'
import { M, T, plasterMat, stripeTex } from './textures'

/**
 * One building of the town, with every way it can look: going up in brick, waiting grey and unpainted,
 * finished, smoking or freshly fixed. Switching between them only toggles groups; nothing is rebuilt.
 */

export interface BuildingView {
  root: THREE.Group
  height: number
  setFinish(f: Finish): void
  setLit(on: boolean): void
  tick(t: number): void
}

const PLASTER = ['#efe4cf', '#ead2c2', '#d9c7a8', '#cfd9d2', '#e8dcc0', '#d8b8a0', '#c9b9a0', '#e3c9a6', '#f1ece2']
const SIGN = ['#3e6b4c', '#b8432f', '#3d5a73', '#7b5c3e', '#5e4a86']
const AWNING: [string, string][] = [['#3e6b4c', '#f1ece2'], ['#b8432f', '#f1ece2'], ['#3d5a73', '#f1ece2'], ['#e8b33a', '#f1ece2']]
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }
/** Sign text: the whole name in upper case; a long one goes onto two lines rather than being shortened. */
const signText = (name: string) => name.toUpperCase()

// ---------------------------------------------------------------------------------------------- kits

export function apartment(w: number, d: number, floors: number, color: string, o: { frame?: THREE.Material; awning?: [string, string] | null } = {}) {
  const m = M(), fh = 1.45, H = floors * fh + 0.25
  const g = grp(box(w, H, d, plasterMat(color)))
  const band = col(new THREE.Color(shade(color, 0.82)).getHex())
  for (let f = 1; f < floors; f++) g.add(at(box(w + 0.05, 0.07, d + 0.05, band), 0, f * fh, 0))
  parapet(g, w, d, H, band)
  const frame = o.frame ?? pick([m.trimW, m.trimG, m.trimB])
  const nz = Math.max(1, Math.round(w / 1.5)), nx = Math.max(1, Math.round(d / 1.5)), doorAt = Math.floor(nz / 2)
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < nz; i++) {
      const x = -w / 2 + (i + 0.5) * w / nz
      if (f === 0 && i === doorAt) { g.add(at(box(0.75, 1.15, 0.06, col(0x6d4c35)), x, 0, d / 2 + 0.01)); continue }
      g.add(at(win(0.62, 0.72, frame), x, f * fh + 0.5, d / 2 + 0.01))
      if (f > 0 && rand() < 0.22) g.add(at(ac(), x + 0.55, f * fh + 0.25, d / 2 + 0.16))
    }
    for (let i = 0; i < nx; i++) g.add(at(win(0.62, 0.72, frame), w / 2 + 0.01, f * fh + 0.5, -d / 2 + (i + 0.5) * d / nx, Math.PI / 2))
  }
  if (o.awning) { const a = box(Math.min(2.4, w * 0.6), 0.05, 0.9, std({ map: stripeTex(...o.awning) })); a.rotation.x = 0.38; g.add(at(a, 0, 1.45, d / 2 + 0.75)) }
  if (rand() < 0.55) g.add(at(box(0.9, 0.65, 0.9, col(0xd8d3ca), 0.04), -w / 4, H, -d / 5))
  if (rand() < 0.5) g.add(at(cyl(0.32, 0.32, 0.55, col(0x5d86a6)), w / 4, H + 0.2, -d / 4))
  return { g, H: H + 0.3 }
}

export function house(w: number, d: number, color: string, o: { roof?: THREE.Material; frame?: THREE.Material; H?: number } = {}) {
  const m = M(), H = o.H ?? 1.8, wall = plasterMat(color)
  const g = grp(box(w, H, d, wall), box(w + 0.04, 0.18, d + 0.04, col(new THREE.Color(shade(color, 0.7)).getHex())))
  g.add(at(gableRoof(w, d, 1.1, o.roof ?? m.tiles, wall), 0, H, 0))
  const frame = o.frame ?? pick([m.trimG, m.trimW, m.trimB])
  g.add(at(box(0.7, 1.15, 0.06, col(0x6d4c35)), -w / 4, 0, d / 2 + 0.01))
  g.add(at(win(0.6, 0.62, frame), w / 5, 0.75, d / 2 + 0.01))
  const n = Math.max(1, Math.round(d / 2))
  for (let i = 0; i < n; i++) g.add(at(win(0.6, 0.62, frame), w / 2 + 0.01, 0.75, -d / 2 + (i + 0.5) * d / n, Math.PI / 2))
  return { g, H: H + 1.1 }
}

function shopKit(w: number, d: number, color: string, name: string, signColor: string, awning: [string, string]) {
  const m = M(), H = 2.3
  const g = grp(box(w, H, d, plasterMat(color)))
  parapet(g, w, d, H, col(new THREE.Color(shade(color, 0.8)).getHex()), 0.14, 0.45)
  g.add(at(box(w * 0.7, 1.3, 0.05, m.dark), 0, 0.05, d / 2 + 0.01))
  const front = at(box(w * 0.66, 1.2, 0.07, m.glass), 0, 0.1, d / 2 + 0.02)
  front.name = 'storefront'; front.userData.keep = true
  g.add(front)
  const a = box(w * 0.8, 0.05, 1, std({ map: stripeTex(...awning) })); a.rotation.x = 0.38
  g.add(at(a, 0, 1.55, d / 2 + 0.55))
  g.add(at(signBoard(signText(name), w * 0.7, 0.45, signColor), 0, 1.75, d / 2 + 0.03))
  g.add(at(win(0.6, 0.6, m.trimW), w / 2 + 0.01, 1, 0, Math.PI / 2))
  g.add(at(pot(), w / 2 - 0.4, 0, d / 2 + 0.4), at(hedge(1.6), -w / 2 + 1, 0, d / 2 + 0.5))
  return { g, H: H + 0.5 }
}

function warehouseKit(w: number, d: number, name: string, color: string, roofTint?: number) {
  const t = T(), H = 2.6
  const g = grp(box(w, H, d, plasterMat(color)))
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(d / 2 + 0.2, d / 2 + 0.2, w + 0.2, 18, 1, false, 0, Math.PI), std({ map: rep(t.corr, 3, 1), roughness: 0.55, metalness: 0.3, ...(roofTint ? { color: roofTint } : {}) }))
  roof.rotation.set(0, 0, Math.PI / 2); roof.scale.set(0.45, 1, 1); roof.position.y = H
  g.add(roof)
  const doors = Math.max(1, Math.floor(w / 2.3))
  for (let i = 0; i < doors; i++) g.add(at(box(1.5, 1.8, 0.05, std({ map: t.rollup })), -w / 2 + (i + 0.5) * w / doors, 0, d / 2 + 0.02))
  g.add(at(signBoard(signText(name), Math.min(3.4, w * 0.6), 0.45, '#7b5c3e'), 0, 2.05, d / 2 + 0.04))
  for (let i = 0; i < 4; i++) g.add(at(crate(), w / 2 - 0.5 - (i % 2) * 0.55, Math.floor(i / 2) * 0.4, d / 2 + 0.7))
  g.add(at(person(0x7a5a3d), w / 2 - 1.6, 0, d / 2 + 0.9))
  return { g, H: H + d * 0.25 }
}

function bank(w: number, d: number, name: string) {
  const H = 3
  const g = grp(box(w, H, d, plasterMat('#e9e2d2')), at(box(w + 0.4, 0.3, d + 0.4, col(0xcfc6b2)), 0, H, 0), box(w + 0.6, 0.22, d + 0.6, col(0xbfb59f)))
  const pedi = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-w / 2 + 0.3, 0), new THREE.Vector2(w / 2 - 0.3, 0), new THREE.Vector2(0, 0.9)]), { depth: 0.3, bevelEnabled: false }), col(0xe2dac8))
  g.add(at(pedi, 0, H + 0.3, d / 2 - 0.1))
  const n = Math.max(4, Math.round(w / 1.2))
  for (let i = 0; i < n; i++) g.add(at(cyl(0.18, 0.2, H - 0.2, col(0xf1ece0), 12), -w / 2 + 0.6 + i * (w - 1.2) / (n - 1), 0.22, d / 2 + 0.45))
  g.add(at(box(w - 0.6, 0.18, 1, col(0xe2dac8)), 0, H - 0.1, d / 2 + 0.45))
  g.add(at(signBoard(signText(name), Math.min(4, w * 0.7), 0.42, '#5e4a86'), 0, H + 0.35, d / 2 + 0.36))
  g.add(at(box(1.1, 1.8, 0.06, col(0x5b4636)), 0, 0.22, d / 2 + 0.02))
  return { g, H: H + 1.2 }
}

function powerStation(w: number, d: number, name: string) {
  const m = M()
  const g = grp(box(w * 0.6, 2.2, d * 0.7, plasterMat('#cdbfa6')), at(signBoard(signText(name), w * 0.5, 0.4, '#4b5a4a'), 0, 1.6, d * 0.35 + 0.02))
  for (const x of [w * 0.15, w * 0.32]) g.add(at(cyl(0.35, 0.45, 4.2, col(0xb9b2a5), 12), x, 0, -d * 0.2))
  for (let i = 0; i < 3; i++) g.add(at(box(0.6, 0.9, 0.5, col(0x8d9a8a), 0.04), -w * 0.35 + i * 0.8, 0, d * 0.35))
  g.add(at(box(w * 0.9, 1.2, 0.04, m.metal), 0, 0, d / 2 - 0.1))
  return { g, H: 4.4 }
}

function guardHouse(name: string) {
  const g = grp(box(1.5, 1.6, 1.4, plasterMat('#e8dcc0'), 0.04), at(box(1.8, 0.14, 1.7, col(0x3d5a73), 0.03), 0, 1.6, 0),
    at(box(1, 0.55, 0.05, M().glass), 0, 0.8, 0.72), at(person(0x2f3f55), 1, 0, 0.7), at(cyl(0.07, 0.07, 0.9, col(0xd9663a), 8), 1.7, 0, 0.9),
    at(box(2.4, 0.08, 0.08, col(0xf2eee6)), 2.9, 0.85, 0.9), at(signBoard(signText(name), 1.4, 0.3, '#3d5a73'), 0, 1.78, 0.6))
  return { g, H: 2.2 }
}

function storageUnits(w: number, d: number, name: string) {
  const t = T()
  const g = grp(box(w, 1.8, d * 0.6, plasterMat('#d6cfc2')), at(box(w + 0.2, 0.12, d * 0.6 + 0.2, col(0x8d6a4a)), 0, 1.8, 0))
  const n = Math.max(3, Math.floor(w / 1.2))
  for (let i = 0; i < n; i++) g.add(at(box(0.9, 1.4, 0.05, std({ map: t.rollup, color: [0xe8b33a, 0xc94f3d, 0x5d86a6][i % 3] })), -w / 2 + (i + 0.5) * w / n, 0, d * 0.3 + 0.02))
  g.add(at(signBoard(signText(name), Math.min(3, w * 0.6), 0.36, '#8d6a4a'), 0, 1.95, d * 0.3))
  return { g, H: 2.4 }
}

// ---------------------------------------------------------------------------------------------- finished looks by kind

function finished(b: Building, w: number, d: number) {
  const m = M(), seed = hash(b.id), color = PLASTER[seed % PLASTER.length]!
  switch (b.kind) {
    case 'shop': return shopKit(w, d, color, b.name, SIGN[seed % SIGN.length]!, AWNING[seed % AWNING.length]!)
    case 'office': {
      const k = apartment(w, d, 3, '#d8c3a5', { frame: m.trimB })
      k.g.add(at(signBoard('OFFICE', 2.2, 0.4, '#3d5a73'), 0, 1.25, d / 2 + 0.03))
      k.g.add(at(grp(box(1.8, 1.4, 1, plasterMat('#cfd9d2')), at(box(1, 0.5, 0.05, m.glass), 0, 0.7, 0.51), at(signBoard('API', 0.8, 0.3, '#3d5a73'), 0, 1.45, 0.45)), w / 2 - 1.1, 0, d / 2 + 0.9))
      return k
    }
    case 'workshop': {
      const k = house(w, d, color)
      k.g.add(at(signBoard(signText(b.name), w * 0.6, 0.32, '#7b5c3e'), 0.2, 1.3, d / 2 + 0.02))
      return k
    }
    case 'warehouse': return warehouseKit(w, d, 'Your data', '#cdbfa6')
    case 'service': {
      switch (b.vendorKind) {
        case 'payments': return bank(w, d, b.name)
        case 'messages': return shopKit(w, d, '#e6cfa0', `${b.name} post`, '#b8432f', ['#b8432f', '#f1ece2'])
        case 'login': return guardHouse(b.name)
        case 'database': return warehouseKit(w, d, b.name, '#c9d3dc', 0x8fb4d6)
        case 'cloud': return storageUnits(w, d, b.name)
        case 'hosting': return powerStation(w, d, b.name)
        case 'ai': {
          const k = bank(w, d, `${b.name} library`)
          return k
        }
        default: {
          const k = apartment(w, d, 2, color)
          k.g.add(at(signBoard(signText(b.name), w * 0.7, 0.4, SIGN[seed % SIGN.length]!), 0, 1.25, d / 2 + 0.03))
          return k
        }
      }
    }
    case 'vault': {
      const g = grp(box(w, 1.7, d, plasterMat('#bdb6a8')), at(box(w + 0.2, 0.2, d + 0.2, col(0x6d6a63), 0.04), 0, 1.7, 0),
        at(box(0.9, 1.1, 0.08, m.metal, 0.04), 0, 0.1, d / 2 + 0.02), at(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), col(0xe0b84a)), 0, 0.65, d / 2 + 0.08))
      return { g, H: 2.1 }
    }
    case 'yard': {
      const g = grp(groundPatch(w, d, 'concrete'))
      for (let i = 0; i < 9; i++) g.add(at(crate(), -w / 2 + 0.6 + (i % 3) * 0.6, Math.floor(i / 3) % 2 ? 0.4 : 0, -d / 2 + 0.6 + Math.floor(i / 3) * 0.7))
      for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const) g.add(at(cyl(0.04, 0.04, 1, m.metal, 6), x, 0, z))
      g.add(at(box(w, 0.04, 0.04, m.metal), 0, 0.95, -d / 2), at(box(0.04, 0.04, d, m.metal), w / 2, 0.95, 0))
      g.add(at(signBoard('SUPPLIES', 1.8, 0.36, '#7b5c3e'), 1, 0.4, d / 2))
      return { g, H: 1.4 }
    }
    case 'inspector': {
      const g = grp(box(w, 1.8, d, plasterMat('#e3d7bf'), 0.04), at(box(w + 0.3, 0.14, d + 0.3, col(0x4f9a5a), 0.03), 0, 1.8, 0),
        at(box(1.1, 0.6, 0.05, m.glass), 0, 0.8, d / 2 + 0.02), at(signBoard('CHECKS', 1.6, 0.34, '#4f9a5a'), 0, 1.95, d / 2 - 0.2))
      return { g, H: 2.4 }
    }
    case 'archive': {
      const k = bank(w, d, 'ARCHIVE')
      return k
    }
    case 'siteOffice': {
      const g = grp(box(w, 1.4, d, col(0xd9a62e), 0.06), at(box(w + 0.1, 0.08, d + 0.1, col(0xf2eee6)), 0, 1.4, 0),
        at(box(0.9, 0.5, 0.05, m.glass), -0.6, 0.7, d / 2 + 0.02), at(box(0.6, 1.1, 0.05, col(0x6d4c35)), 0.9, 0, d / 2 + 0.02),
        at(signBoard('SITE OFFICE', 2, 0.3, '#2f2b26'), 0, 1.5, d / 2 - 0.1))
      return { g, H: 2 }
    }
  }
}

// ---------------------------------------------------------------------------------------------- construction looks

function rising(w: number, d: number, H: number) {
  const m = M(), h = Math.max(1.2, H * 0.55)
  const g = grp(groundPatch(w + 0.8, d + 0.8, 'dirt'), box(w + 0.2, 0.3, d + 0.2, m.concrete))
  const walls: [number, number, number, number][] = [[0, d / 2 - 0.1, w, 0.22], [w / 2 - 0.1, 0, 0.22, d], [0, -d / 2 + 0.1, w, 0.22], [-w / 2 + 0.1, 0, 0.22, d]]
  for (const [x, z, ww, dd] of walls) g.add(at(box(ww, h, dd, m.brick(Math.max(ww, dd) / 1.1, h / 0.55)), x, 0.3, z))
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const) g.add(at(box(0.12, H, 0.12, m.rebar), x, 0.3, z))
  // scaffolding on the two faces the camera sees
  const scaf = col(0x9aa0a6)
  for (let i = 0; i <= 3; i++) g.add(at(cyl(0.03, 0.03, h + 0.6, scaf, 5), -w / 2 + i * w / 3, 0, d / 2 + 0.45))
  for (const y of [0.9, 1.8]) if (y < h + 0.5) g.add(at(box(w, 0.04, 0.4, M().wood), 0, y, d / 2 + 0.45))
  return g
}

function unpainted(w: number, d: number, H: number) {
  const m = M(), h = Math.max(1.4, H * 0.7)
  const g = grp(box(w, h, d, m.concrete))
  g.add(at(gableRoof(w, d, 0.9, m.corr, m.concrete), 0, h, 0))
  for (const x of [-w / 4, w / 4]) g.add(at(box(0.7, 0.7, 0.04, col(0x2b2420)), x, h * 0.45, d / 2 + 0.02))
  return g
}

function smokeGroup(H: number) {
  const puffs: THREE.Mesh[] = []
  const g = new THREE.Group()
  for (let i = 0; i < 7; i++) { const p = ball(0.6, std({ color: 0x5e5a56, transparent: true, opacity: 0.7, flatShading: true })); g.add(p); puffs.push(p) }
  g.position.y = H
  return { g, tick: (t: number) => puffs.forEach((p, i) => { const ph = (t * 0.45 + i / puffs.length) % 1; p.position.set(Math.sin(i * 2.3) * 0.5 + ph, ph * 3.4, Math.cos(i * 1.7) * 0.5); p.scale.setScalar(0.5 + ph * 1.3); (p.material as THREE.MeshStandardMaterial).opacity = (1 - ph) * 0.7 }) }
}

export function makeBuilding(b: Building, w: number, d: number): BuildingView {
  const f = finished(b, w, d)
  const done = bake(f.g)
  const storefront = done.getObjectByName('storefront') as THREE.Mesh | undefined
  const H = f.H
  const up = bake(rising(w, d, H)), grey = bake(unpainted(w, d, H))
  const smoke = smokeGroup(H)
  const badge = at(signBoard('FIXED', 1.4, 0.42, '#3a9a5a'), 0, H + 0.6, 0)
  const root = grp(done, up, grey, smoke.g, badge)
  root.userData.buildingId = b.id
  root.traverse((o) => { o.userData.buildingId = b.id })
  let current: Finish = 'built'
  const show = (fin: Finish) => {
    current = fin
    up.visible = fin === 'rising'
    grey.visible = fin === 'unpainted' || fin === 'smoking'
    done.visible = fin === 'built' || fin === 'painted' || fin === 'fixed'
    smoke.g.visible = fin === 'smoking'
    badge.visible = fin === 'fixed'
  }
  show(b.finish)
  return {
    root,
    height: H,
    setFinish: (fin) => { if (fin !== current) show(fin) },
    setLit: (on) => { if (storefront) storefront.material = on ? M().litGlass : M().glass },
    tick: (t) => { if (smoke.g.visible) smoke.tick(t); if (badge.visible) badge.position.y = H + 0.6 + Math.sin(t * 3) * 0.08 },
  }
}

/** The town that fills in once the app is live: varied houses, apartments and shops on their own plots. */
export function fillerBuilding(kind: 'house' | 'apartment' | 'shop', near: boolean): THREE.Group {
  const c = pick(PLASTER)
  let k
  if (kind === 'house') k = house(3.6 + rand(), 3.2 + rand() * 0.8, c)
  else if (kind === 'apartment') k = apartment(3.8 + rand() * 1.4, 3.6 + rand() * 1.2, near ? 2 + (rand() * 3 | 0) : 2 + (rand() * 2 | 0), c, { awning: rand() < 0.3 ? pick(AWNING) : null })
  else k = shopKit(4.4, 3.6, c, pick(['BAKERY', 'MARKET', 'CAFE', 'BOOKS', 'TOOLS']), pick(SIGN), pick(AWNING))
  const yard = grp(groundPatch(5.6, 5.6, 'pavers'), k.g)
  if (rand() < 0.6) yard.add(at(tree(0.8 + rand() * 0.3), 2.4, 0, 2.4))
  if (rand() < 0.4) yard.add(at(hedge(2.5), -1, 0, 2.6))
  return bake(yard)
}
