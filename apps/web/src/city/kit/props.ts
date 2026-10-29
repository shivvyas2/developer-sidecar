import * as THREE from 'three'
import { at, ball, box, col, cyl, grp, pick, rand } from './core'
import { M, T } from './textures'
import { rep, std } from './core'

/** Street furniture, plants, people and building details. */

export function tree(s = 1) {
  const m = M()
  const g = grp(cyl(0.07 * s, 0.12 * s, 1.2 * s, m.trunk, 7))
  const n = 5 + (rand() * 3 | 0)
  for (let i = 0; i < n; i++) g.add(at(ball((0.42 + rand() * 0.3) * s, pick(m.leaves)), (rand() - 0.5) * 0.9 * s, (1.35 + rand() * 0.75) * s, (rand() - 0.5) * 0.9 * s))
  return g
}
export function cypress(s = 1) {
  const m = M()
  return grp(cyl(0.05 * s, 0.07 * s, 0.4 * s, m.trunk, 6), at(new THREE.Mesh(new THREE.ConeGeometry(0.32 * s, 2 * s, 8).translate(0, s, 0), m.cypress), 0, 0.3 * s, 0))
}
export const hedge = (l: number, d = 0.5) => box(l, 0.55, d, M().hedge, 0.12)
export const pot = () => grp(cyl(0.14, 0.1, 0.22, col(0xb5683f), 8), at(ball(0.18, pick(M().leaves)), 0, 0.32, 0))
export function person(c: number) {
  return grp(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.26, 3, 8), col(c)), 0, 0.22, 0), at(ball(0.075, M().skin, 1), 0, 0.5, 0))
}
/** A worker in a hard hat. */
export function worker(c: number, hat = 0xf2b233) {
  return grp(person(c), at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), col(hat)), 0, 0.54, 0))
}
export function pole() {
  const m = M()
  return grp(cyl(0.05, 0.08, 4, m.wood, 6), at(box(0.08, 0.07, 1.1, m.wood), 0, 3.7, 0), ...[-0.45, 0, 0.45].map((z) => at(cyl(0.03, 0.03, 0.1, m.white, 6), 0, 3.77, z)))
}
export function lamp(lit: THREE.Material) {
  const m = M()
  return grp(cyl(0.04, 0.06, 2.6, m.dark, 6), at(box(0.6, 0.05, 0.05, m.dark), 0.28, 2.55, 0), at(box(0.22, 0.1, 0.14, lit), 0.55, 2.48, 0))
}
export function pallet(kind: 'brick' | 'cement') {
  const m = M()
  const g = grp(box(1, 0.12, 0.8, m.wood))
  if (kind === 'brick') g.add(at(box(0.9, 0.5, 0.7, m.brick(1, 1)), 0, 0.12, 0))
  else for (let i = 0; i < 4; i++) g.add(at(box(0.42, 0.16, 0.32, col(0xe8e2d4), 0.05), (i % 2 - 0.5) * 0.44, 0.12 + Math.floor(i / 2) * 0.17, 0))
  return g
}
export const crate = () => box(0.5, 0.4, 0.5, col(0xb88d5a), 0.03)

/** A window facing +z, origin at its bottom centre. */
export function win(w: number, h: number, frame: THREE.Material, glass?: THREE.Material) {
  const m = M()
  return grp(at(box(w + 0.14, h + 0.14, 0.05, frame), 0, -0.07, 0), at(box(w, h, 0.07, glass ?? m.glass), 0, 0, 0.005),
    at(box(0.05, h, 0.09, frame), 0, 0, 0), at(box(w + 0.28, 0.07, 0.16, m.sill), 0, -0.12, 0.04))
}
export const ac = () => grp(box(0.55, 0.38, 0.3, col(0xe4e1da), 0.04), at(new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), M().dark), 0.1, 0.19, 0.151))

export function parapet(g: THREE.Group, w: number, d: number, H: number, mat: THREE.Material, t = 0.14, ph = 0.32) {
  g.add(at(box(w - 0.3, 0.03, d - 0.3, M().roofFlat), 0, H, 0))
  g.add(at(box(w, ph, t, mat), 0, H, d / 2 - t / 2)); g.add(at(box(w, ph, t, mat), 0, H, -d / 2 + t / 2))
  g.add(at(box(t, ph, d, mat), w / 2 - t / 2, H, 0)); g.add(at(box(t, ph, d, mat), -w / 2 + t / 2, H, 0))
}
/** A pitched roof with its ridge along x; the gable ends take `capMat`. */
export function gableRoof(w: number, d: number, rise: number, roofMat: THREE.Material, capMat: THREE.Material, over = 0.35) {
  const s = new THREE.Shape([new THREE.Vector2(-d / 2 - over, 0), new THREE.Vector2(d / 2 + over, 0), new THREE.Vector2(0, rise)])
  const geo = new THREE.ExtrudeGeometry(s, { depth: w + over * 2, bevelEnabled: false })
  geo.translate(0, 0, -(w + over * 2) / 2); geo.rotateY(Math.PI / 2)
  return new THREE.Mesh(geo, [capMat, roofMat])
}

export const groundPatch = (w: number, d: number, kind: 'dirt' | 'pavers' | 'concrete') => {
  const t = T()
  const map = kind === 'dirt' ? rep(t.dirt, w / 4, d / 4) : kind === 'pavers' ? rep(t.pavers, w / 1.4, d / 1.4) : rep(t.concrete, w / 4, d / 4)
  return new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d).translate(0, 0.02, 0), std({ map }))
}
