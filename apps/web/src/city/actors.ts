import * as THREE from 'three'
import type { Overlay, SceneKind } from '@sidecar/shared'
import { at, ball, box, col, cyl, grp, signBoard, std } from './kit/core'
import { crate, person, worker } from './kit/props'
import { M } from './kit/textures'
import { mixer, vehicle } from './kit/vehicles'

/**
 * The short pieces of work a step plays at its building. Each scene is a throwaway group placed at the
 * building's front with an `update(k)` for k from 0 to 1; the foreman walks over separately.
 */

export interface Spot { x: number; z: number; w: number; d: number; h: number }
export interface SceneRun { group: THREE.Group; duration: number; update(k: number, t: number): void }

const EDGE = 49
/** People read as people from the town's distance only a little larger than life. */
const BIG = 1.6
const big = <T extends THREE.Object3D>(o: T): T => { o.scale.setScalar(BIG); return o }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => k * k * (3 - 2 * k)
const front = (s: Spot, dx = 0, out = 1.3) => new THREE.Vector3(s.x + dx, 0, s.z + s.d / 2 + out)

/** Moves `o` from a to b over the part of the scene between k0 and k1, facing where it goes. */
function travel(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, k: number, k0 = 0, k1 = 1) {
  const u = smooth(Math.min(1, Math.max(0, (k - k0) / (k1 - k0))))
  o.position.lerpVectors(a, b, u)
  const dx = b.x - a.x, dz = b.z - a.z
  if (Math.abs(dx) + Math.abs(dz) > 0.01) o.rotation.y = Math.atan2(-dz, dx)
}

function hammer(): THREE.Group { return grp(at(box(0.04, 0.3, 0.04, col(0x7a5a3d)), 0, 0, 0), at(box(0.14, 0.07, 0.07, M().dark), 0, 0.3, 0)) }

function work(kind: SceneKind, s: Spot, ctx: { site: Spot }): SceneRun {
  const g = new THREE.Group()
  const m = M()
  switch (kind) {
    case 'blueprint': {
      const sheet = at(box(0.6, 0.02, 0.45, col(0xdfe9f3)), 0, 0.55, 0); sheet.rotation.x = -0.5
      const p = at(grp(sheet), front(s, -0.8).x + 0.35, 0, front(s).z - 0.1); g.add(p)
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 40), new THREE.MeshBasicMaterial({ color: 0x8ec5e6, transparent: true, opacity: 0.5, depthWrite: false }))
      glow.rotation.x = -Math.PI / 2; glow.position.set(s.x, 0.06, s.z); g.add(glow)
      return { group: g, duration: 2.4, update: (k) => { glow.scale.setScalar((Math.max(s.w, s.d) / 2 + 0.8) * (0.6 + 0.4 * Math.sin(k * Math.PI))); (glow.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.sin(k * Math.PI) } }
    }
    case 'bricks': {
      const bricks = Array.from({ length: 8 }, (_, i) => at(box(0.34, 0.16, 0.16, m.brick(0.4, 0.3)), front(s, -1.2 + (i % 4) * 0.36).x, 0.02 + Math.floor(i / 4) * 0.17, front(s, 0, 0.4).z))
      bricks.forEach((b) => g.add(b))
      return { group: g, duration: 3, update: (k) => bricks.forEach((b, i) => { b.visible = k > (i + 1) / 10 }) }
    }
    case 'scaffold':
    case 'toolbox': {
      const h = hammer(); const p = at(grp(h), front(s, 0.6).x, 0.35, front(s).z); g.add(p)
      if (kind === 'toolbox') g.add(at(box(0.35, 0.18, 0.2, col(0xc94f3d), 0.03), front(s, 0.9).x, 0, front(s).z + 0.2))
      else for (let i = 0; i < 3; i++) g.add(at(cyl(0.03, 0.03, 2.2, col(0x9aa0a6), 5), s.x - s.w / 2 + 0.4 + i * (s.w - 0.8) / 2, 0, s.z + s.d / 2 + 0.45))
      return { group: g, duration: 2.6, update: (_k, t) => { p.rotation.z = Math.sin(t * 12) * 0.7 } }
    }
    case 'paint': {
      const coat = at(box(s.w * 0.8, 1, 0.02, std({ color: 0xe9a36a, transparent: true, opacity: 0.85 })), s.x, 0.2, s.z + s.d / 2 + 0.06)
      const roller = at(box(0.5, 0.08, 0.08, col(0xf2eee6), 0.03), s.x, 0.2, s.z + s.d / 2 + 0.15)
      g.add(coat, roller)
      return { group: g, duration: 2.8, update: (k) => { const y = Math.max(0.01, smooth(k) * 1.8); coat.scale.y = y; roller.position.y = 0.2 + y } }
    }
    case 'delivery': {
      const truck = vehicle(0x3d5a73, 'flatbed'); g.add(truck)
      const crates = [0, 1, 2].map((i) => at(big(crate()), front(s, -0.8 + i * 0.6).x, 0, front(s, 0, 0.5).z)); crates.forEach((c) => g.add(c))
      const a = new THREE.Vector3(EDGE, 0, 9.1), b = front(s, 2, 2.2)
      return { group: g, duration: 3.6, update: (k) => { travel(truck, a, b, k, 0, 0.55); crates.forEach((c, i) => { c.visible = k > 0.6 + i * 0.1 }) } }
    }
    case 'inspect': {
      const insp = big(worker(0x3d5a73, 0xf2eee6)); g.add(insp)
      insp.add(at(box(0.16, 0.2, 0.03, m.white), 0.1, 0.32, 0.1))
      const r = Math.max(s.w, s.d) / 2 + 0.9
      return { group: g, duration: 3.2, update: (k) => { const a = Math.PI * 0.25 + k * Math.PI * 1.2; insp.position.set(s.x + Math.cos(a) * r, 0, s.z + Math.sin(a) * r); insp.rotation.y = -a } }
    }
    case 'pour': {
      const mx = mixer(); g.add(mx)
      const a = new THREE.Vector3(EDGE, 0, 9.1), b = front(s, 2.6, 2.4)
      return { group: g, duration: 3.6, update: (k, t) => { travel(mx, a, b, k, 0, 0.5); (mx.userData.anim as (t: number) => void)(t) } }
    }
    case 'lightsOn':
    case 'lightsOff': {
      const spark = ball(0.18, std({ color: 0xffe6a0, emissive: 0xffd070, emissiveIntensity: 1.5 })); spark.position.set(s.x, s.h + 0.4, s.z + s.d / 2)
      g.add(spark)
      return { group: g, duration: 1.8, update: (k) => { spark.scale.setScalar(kind === 'lightsOn' ? 0.4 + Math.sin(k * Math.PI) : 1 - k) } }
    }
    case 'library': {
      const car = vehicle(0x5d86a6, 'car'); g.add(car)
      const a = front(ctx.site, 1.5, 1.5), b = new THREE.Vector3(-EDGE, 0, 9.1)
      return { group: g, duration: 3, update: (k) => travel(car, a, b, k) }
    }
    case 'cable': {
      const from = new THREE.Vector3(s.x, 2, s.z), to = new THREE.Vector3(ctx.site.x, 2, ctx.site.z)
      const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).setY(4), to), 24, 0.05, 5), std({ color: 0xe8b33a, emissive: 0xe8b33a, emissiveIntensity: 0.4 }))
      g.add(wire)
      return { group: g, duration: 2.6, update: (k) => { wire.geometry.setDrawRange(0, Math.floor(smooth(Math.min(1, k * 1.5)) * wire.geometry.index!.count / 3) * 3) } }
    }
    case 'photo': {
      const ph = big(person(0x5e4a86)); ph.add(at(box(0.16, 0.12, 0.12, M().dark), 0.12, 0.38, 0)); at(ph, front(s, 1.5, 2).x, 0, front(s, 0, 2).z, 2.3); g.add(ph)
      const flash = ball(0.4, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); flash.position.set(ph.position.x, 0.6, ph.position.z); g.add(flash)
      return { group: g, duration: 2.2, update: (k) => { const on = k > 0.45 && k < 0.6; flash.visible = on; (flash.material as THREE.MeshBasicMaterial).opacity = on ? 1 - (k - 0.45) / 0.15 : 0 } }
    }
    case 'branch':
    case 'merge': {
      const path = at(box(0.9, 0.03, 4, col(0xcbbf9f)), s.x + s.w / 2 + 1.2, 0, s.z + 1)
      const sign = at(grp(cyl(0.03, 0.03, 1.2, M().dark, 5), at(signBoard(kind === 'branch' ? 'NEW BRANCH' : 'MERGED', 1.4, 0.32, '#3d5a73'), 0, 1, 0)), path.position.x, 0, path.position.z + 2)
      g.add(path, sign)
      return { group: g, duration: 2.6, update: (k) => { path.scale.z = Math.max(0.01, kind === 'branch' ? smooth(k) : 1 - smooth(k)) } }
    }
    case 'pushTruck':
    case 'pullTruck': {
      const van = vehicle(0xf1ece2, 'van'); g.add(van)
      const near = front(s, 2, 2), far = new THREE.Vector3(EDGE, 0, 9.1)
      return { group: g, duration: 3, update: (k) => (kind === 'pushTruck' ? travel(van, near, far, k) : travel(van, far, near, k)) }
    }
    case 'proposal': {
      const board = at(grp(cyl(0.04, 0.04, 1.4, M().wood, 5), at(cyl(0.04, 0.04, 1.4, M().wood, 5), 1.1, 0, 0), at(box(1.3, 0.8, 0.05, col(0x9b7350)), 0.55, 0.7, 0), at(box(0.5, 0.6, 0.02, m.white), 0.55, 0.8, 0.04)), front(s, 1.8).x, 0, front(s).z)
      g.add(board)
      return { group: g, duration: 2.4, update: (k) => { board.scale.y = Math.min(1, k * 3) } }
    }
    case 'forklift': {
      const fl = grp(box(0.9, 0.5, 0.6, col(0xe8b33a), 0.05), at(box(0.06, 1.1, 0.5, M().dark), 0.48, 0, 0), at(big(crate()), 0.75, 0.2, 0))
      g.add(fl)
      const a = front(s, -1.5, 1), b = front(s, 1.5, 1)
      return { group: g, duration: 3, update: (k) => travel(fl, k < 0.5 ? a : b, k < 0.5 ? b : a, k < 0.5 ? k * 2 : (k - 0.5) * 2) }
    }
    case 'ribbon': {
      const l = at(cyl(0.04, 0.04, 1, M().dark, 5), s.x - 1.2, 0, s.z + s.d / 2 + 1), r = at(cyl(0.04, 0.04, 1, M().dark, 5), s.x + 1.2, 0, s.z + s.d / 2 + 1)
      const halfL = at(box(1.2, 0.08, 0.02, col(0xc0392b)), s.x - 0.6, 0.85, s.z + s.d / 2 + 1), halfR = at(box(1.2, 0.08, 0.02, col(0xc0392b)), s.x + 0.6, 0.85, s.z + s.d / 2 + 1)
      const open = at(signBoard('OPEN', 1.2, 0.4, '#3a9a5a'), s.x, s.h + 0.3, s.z + s.d / 2)
      g.add(l, r, halfL, halfR, open)
      return { group: g, duration: 3, update: (k) => { const cut = k > 0.4; halfL.rotation.z = cut ? -1.2 * smooth(Math.min(1, (k - 0.4) * 3)) : 0; halfR.rotation.z = -halfL.rotation.z; open.visible = cut } }
    }
    case 'helpers': {
      const crew = [0x6c4f7a, 0x2e8b8b, 0xc94f3d].map((c) => big(worker(c, 0xf2eee6))); crew.forEach((w) => g.add(w))
      const a = front(ctx.site, 0, 0.8)
      return { group: g, duration: 3, update: (k) => crew.forEach((w, i) => travel(w, a, front(s, -0.8 + i * 0.8, 1.6), k, i * 0.1, 0.8)) }
    }
    case 'workOrder': {
      const you = big(person(0x2f2b26)); at(you, front(ctx.site, 1).x, 0, front(ctx.site).z); g.add(you)
      const paper = at(box(0.3, 0.02, 0.4, m.white), you.position.x, 0.45, you.position.z); g.add(paper)
      return { group: g, duration: 2.2, update: (k) => { paper.position.x = lerp(you.position.x, you.position.x - 0.9, smooth(Math.min(1, k * 1.5))) } }
    }
  }
}

function overlay(kind: Overlay, s: Spot): SceneRun | null {
  const g = new THREE.Group()
  if (kind === 'failed') {
    const puffs = Array.from({ length: 5 }, () => ball(0.45, std({ color: 0x4e4a46, transparent: true, opacity: 0.7, flatShading: true })))
    puffs.forEach((p) => g.add(p))
    const flag = at(grp(cyl(0.03, 0.03, 1.2, M().dark, 5), at(box(0.5, 0.32, 0.02, col(0xc0392b)), 0.25, 0.85, 0)), s.x + s.w / 2 + 0.6, 0, s.z + s.d / 2 + 0.6)
    g.add(flag)
    return { group: g, duration: 2.6, update: (k, t) => puffs.forEach((p, i) => { const ph = (t * 0.6 + i / 5) % 1; p.position.set(s.x + Math.sin(i * 2) * 0.5, s.h + ph * 2.6, s.z + Math.cos(i) * 0.4); p.scale.setScalar(0.5 + ph); (p.material as THREE.MeshStandardMaterial).opacity = (1 - ph) * 0.75 * Math.min(1, k * 4) }) }
  }
  if (kind === 'stopped') {
    const cone = at(grp(cyl(0.02, 0.18, 0.45, col(0xe8742e), 10), at(cyl(0.07, 0.11, 0.08, col(0xf2eee6), 10), 0, 0.2, 0)), s.x - s.w / 2 - 0.4, 0, s.z + s.d / 2 + 0.6)
    g.add(cone)
    return { group: g, duration: 1.8, update: (k) => { cone.scale.setScalar(Math.min(1, k * 3)) } }
  }
  if (kind === 'fixed') {
    const crew = [0xc0392b, 0xc0392b].map((c) => big(worker(c))); crew.forEach((w, i) => g.add(at(w, s.x - 0.6 + i * 1.2, 0, s.z + s.d / 2 + 1)))
    const badge = at(signBoard('FIXED', 1.4, 0.42, '#3a9a5a'), s.x, s.h + 0.6, s.z)
    g.add(badge)
    return { group: g, duration: 2.6, update: (_k, t) => { crew.forEach((w, i) => { w.position.y = Math.abs(Math.sin(t * 8 + i)) * 0.06 }) } }
  }
  if (kind === 'waiting') {
    const sign = at(grp(cyl(0.03, 0.03, 1.6, M().dark, 5), at(signBoard('NEEDS YOUR OK', 1.8, 0.42, '#d9663a'), 0, 1.3, 0)), s.x + 1.4, 0, s.z + s.d / 2 + 1.2)
    g.add(sign)
    return { group: g, duration: 2, update: (_k, t) => { sign.rotation.z = Math.sin(t * 4) * 0.05 } }
  }
  return null
}

/** The work for a scene, plus its failure, stop, fix or waiting overlay. */
export function buildScene(kind: SceneKind, over: Overlay, at_: Spot, site: Spot): SceneRun {
  const w = over === 'waiting' ? work('workOrder', site, { site }) : work(kind, at_, { site })
  const o = overlay(over, over === 'waiting' ? site : at_)
  if (!o) return w
  const g = grp(w.group, o.group)
  return { group: g, duration: Math.max(w.duration, o.duration), update: (k, t) => { w.update(k, t); o.update(k, t) } }
}
