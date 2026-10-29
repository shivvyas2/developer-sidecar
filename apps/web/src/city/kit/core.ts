import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** The city's shared toolkit: a seeded random, canvas textures, materials and small geometry helpers. */

let seed = 11
export function reseed(n: number) { seed = n }
export const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
export const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, rx = 1, ry = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d')!, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8
  return t
}
export const rep = (t: THREE.Texture, rx: number, ry: number) => { const c = t.clone(); c.userData = {}; c.repeat.set(rx, ry); c.needsUpdate = true; return c }
export function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, cols: string[], s0 = 1, s1 = 3) {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]!; const s = s0 + rand() * (s1 - s0); g.fillRect(rand() * w, rand() * h, s, s) }
}
export const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`
}

export const std = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, ...o })
const matCache = new Map<number, THREE.MeshStandardMaterial>()
/** Marks a material or texture as shared, so disposeTree leaves it for the next user. */
export const cached = <T extends { userData: Record<string, unknown> }>(o: T): T => { o.userData.cached = true; return o }
export const col = (hex: number) => { if (!matCache.has(hex)) matCache.set(hex, cached(std({ color: hex }))); return matCache.get(hex)! }
const paintCache = new Map<number, THREE.MeshStandardMaterial>()
/** Glossy, flat-shaded paint for vehicles and machines. */
export const paint = (hex: number) => { if (!paintCache.has(hex)) paintCache.set(hex, cached(std({ color: hex, roughness: 0.5, flatShading: true }))); return paintCache.get(hex)! }

export function box(w: number, h: number, d: number, m: THREE.Material, r = 0) {
  const g = r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)
  g.translate(0, h / 2, 0)
  return new THREE.Mesh(g, m)
}
export function cyl(rt: number, rb: number, h: number, m: THREE.Material, s = 14) {
  const g = new THREE.CylinderGeometry(rt, rb, h, s); g.translate(0, h / 2, 0); return new THREE.Mesh(g, m)
}
export const ball = (r: number, m: THREE.Material, d = 1) => new THREE.Mesh(new THREE.IcosahedronGeometry(r, d), m)
export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T { o.position.set(x, y, z); o.rotation.y = ry; return o }
export function grp(...k: (THREE.Object3D | null | undefined | false)[]) { const g = new THREE.Group(); for (const c of k) if (c) g.add(c); return g }
export function tube(a: THREE.Vector3, b: THREE.Vector3, sag: number, r: number, m: THREE.Material) {
  const mid = a.clone().lerp(b, 0.5); mid.y -= sag
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 14, r, 4), m)
}
/** A side profile (x forward, y up) extruded across z, with chamfered edges. */
export function prof(pts: [number, number][], depth: number, mat: THREE.Material, bevel = 0.025) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const d = Math.max(0.002, depth - bevel * 2)
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 5 })
  g.translate(0, 0, -d / 2)
  return new THREE.Mesh(g, mat)
}
export function rod(a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length()
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m)
  mesh.position.copy(A).addScaledVector(dir, 0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}
export const axisZ = <T extends THREE.Object3D>(m: T) => { m.rotation.x = Math.PI / 2; return m }
export const axisX = <T extends THREE.Object3D>(m: T) => { m.rotation.z = Math.PI / 2; return m }

const FONT = 'Inter Variable, system-ui, sans-serif'

/**
 * Text on a sign: one line when it fits at a readable size, otherwise two lines split between words.
 * It is never shortened or cut, only set smaller.
 */
export function textTex(text: string, bg: string, fg: string, w = 512, h = 128) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h)
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
    const fits = (line: string, size: number) => { g.font = `700 ${size}px ${FONT}`; return g.measureText(line).width <= w * 0.92 }
    let size = h * 0.52
    while (size > h * 0.34 && !fits(text, size)) size -= 2
    if (fits(text, size)) { g.font = `700 ${size}px ${FONT}`; g.fillText(text, w / 2, h / 2 + 3); return }
    // two lines, split at the space that best balances them
    const words = text.split(' ')
    let best: [string, string] = [text, '']
    let bestWidth = Infinity
    g.font = `700 ${h * 0.4}px ${FONT}`
    for (let i = 1; i < words.length; i++) {
      const pair: [string, string] = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
      const wide = Math.max(g.measureText(pair[0]).width, g.measureText(pair[1]).width)
      if (wide < bestWidth) { bestWidth = wide; best = pair }
    }
    size = h * 0.42
    while (size > 8 && !(fits(best[0], size) && fits(best[1], size))) size -= 1
    g.font = `700 ${size}px ${FONT}`
    g.fillText(best[0], w / 2, h / 2 - size * 0.55 + 2)
    g.fillText(best[1], w / 2, h / 2 + size * 0.55 + 2)
  })
}

/** A sign board facing +z, origin at its bottom centre. */
export function signBoard(text: string, w: number, h: number, bg: string, fg = '#fff') {
  const side = col(new THREE.Color(bg).getHex())
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08).translate(0, h / 2, 0), [side, side, side, side, std({ map: textTex(text, bg, fg) }), side])
}

/**
 * Merges a group's meshes by material into one mesh each, so a building costs a handful of draw calls.
 * Multi-material meshes (signs, roofs) are kept as they are.
 */
export function bake(root: THREE.Object3D): THREE.Group {
  const p = root.position.clone(), q = root.quaternion.clone(), s = root.scale.clone()
  root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1); root.updateMatrixWorld(true)
  const buckets = new Map<string, { m: THREE.Material; gs: THREE.BufferGeometry[] }>()
  const keep: THREE.Mesh[] = []
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    if (Array.isArray(o.material) || o.userData.keep) { keep.push(o); return }
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld)
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2))
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    g.clearGroups()
    const m = o.material as THREE.Material
    if (!buckets.has(m.uuid)) buckets.set(m.uuid, { m, gs: [] })
    buckets.get(m.uuid)!.gs.push(g)
  })
  const out = new THREE.Group()
  for (const { m, gs } of buckets.values()) out.add(new THREE.Mesh(mergeGeometries(gs, false), m))
  for (const o of keep) { const c = o.clone(); o.matrixWorld.decompose(c.position, c.quaternion, c.scale); out.add(c) }
  out.position.copy(p); out.quaternion.copy(q); out.scale.copy(s)
  out.traverse((m) => { if (m instanceof THREE.Mesh) { m.castShadow = true; m.receiveShadow = true } })
  return out
}

/** Frees the GPU memory of everything under `root` that was made for it: geometries, and materials and textures not marked shared. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    o.geometry.dispose()
    for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[]) {
      if (m.userData.cached) continue
      const map = (m as THREE.MeshStandardMaterial).map
      if (map && !map.userData.cached) map.dispose()
      m.dispose()
    }
  })
}
