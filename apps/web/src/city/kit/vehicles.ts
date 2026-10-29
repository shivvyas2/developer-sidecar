import * as THREE from 'three'
import { at, axisX, axisZ, bake, ball, box, cyl, grp, paint, pick, prof, rep, rod, std } from './core'
import { M, T } from './textures'

/**
 * Low-poly machines and traffic: chamfered bodies, flat shading, glass that sits proud of the panels.
 * Machines carry an `anim(t)` in userData that moves their arms, drum or exhaust.
 */
const P = paint
const V = {
  tire: std({ color: 0x232428, roughness: .9, flatShading: true }),
  steel: std({ color: 0x4a4d55, roughness: .6, flatShading: true }),
  chrome: std({ color: 0xc9ccd1, roughness: .3, metalness: .6, flatShading: true }),
  glass: std({ color: 0x8ec5e6, roughness: .12, metalness: .2, flatShading: true }),
  tint: std({ color: 0x2c3a46, roughness: .12, metalness: .3, flatShading: true }),
  head: std({ color: 0xfff6d8, emissive: 0xfff1c0, emissiveIntensity: .3 }),
  tail: std({ color: 0xd2382c, emissive: 0x801a12, emissiveIntensity: .3 }),
  rim: std({ color: 0xd8dade, roughness: .4, metalness: .4, flatShading: true }),
}
function wheel(r: number, w: number, rim: THREE.Material = V.rim, tread = false) {
  const g = new THREE.Group()
  g.add(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16), V.tire)))
  g.add(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(r * .58, r * .58, w + .02, 10), rim)))
  g.add(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(r * .2, r * .2, w + .05, 8), V.steel)))
  if (tread) for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(r * .3, r * .14, w * .52), V.tire)
    b.position.set(Math.cos(a) * r, Math.sin(a) * r, (i % 2 ? 1 : -1) * w * .24); b.rotation.z = a + Math.PI / 2; g.add(b)
  }
  return g
}
function track(L: number, R: number, w: number) {
  const g = new THREE.Group(), s = new THREE.Shape()
  s.moveTo(-L / 2, -R); s.lineTo(L / 2, -R); s.absarc(L / 2, 0, R, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-L / 2, R); s.absarc(-L / 2, 0, R, Math.PI / 2, Math.PI * 1.5, false)
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 1, curveSegments: 8 }); geo.translate(0, 0, -w / 2)
  g.add(new THREE.Mesh(geo, V.tire))
  const per = 2 * L + 2 * Math.PI * R, n = Math.round(per / .16)
  for (let i = 0; i < n; i++) {
    let d = i / n * per, x: number, y: number, a: number
    if (d < L) { x = -L / 2 + d; y = -R; a = 0 }
    else if ((d -= L) < Math.PI * R) { const t = -Math.PI / 2 + d / R; x = L / 2 + Math.cos(t) * R; y = Math.sin(t) * R; a = t + Math.PI / 2 }
    else if ((d -= Math.PI * R) < L) { x = L / 2 - d; y = R; a = Math.PI }
    else { d -= L; const t = Math.PI / 2 + d / R; x = -L / 2 + Math.cos(t) * R; y = Math.sin(t) * R; a = t + Math.PI / 2 }
    const p = new THREE.Mesh(new THREE.BoxGeometry(.1, .05, w + .05), V.steel)
    p.position.set(x + Math.cos(a - Math.PI / 2) * .025, y + Math.sin(a - Math.PI / 2) * .025, 0); p.rotation.z = a; g.add(p)
  }
  for (const [x, y, r] of [[-L / 2, 0, .62], [L / 2, 0, .62], [-L / 6, -R * .4, .45], [L / 6, -R * .4, .45]] as const) g.add(at(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(R * r, R * r, w + .08, 10), P(0x6b6e76))), x, y, 0))
  return g
}

export function excavator() {
  const Y = P(0xf4b62e), Yd = P(0xdc9b1c), K = V.steel, dark = P(0x3a3d45)
  const root = new THREE.Group()
  const lower = new THREE.Group()
  for (const z of [-.55, .55]) lower.add(at(track(1.9, .28, .36), 0, .3, z))
  lower.add(at(box(1.3, .22, .74, K), 0, .36, 0)); lower.add(at(cyl(.42, .42, .12, dark, 12), 0, .58, 0))
  root.add(bake(lower))
  const upper = new THREE.Group(); upper.position.y = .7; root.add(upper)
  const body = new THREE.Group()
  body.add(prof([[-1.05, 0], [.7, 0], [.7, .42], [-.98, .42], [-1.1, .22]], 1.2, Y))
  body.add(prof([[-1.0, .42], [-.22, .42], [-.28, .62], [-.92, .62]], 1.05, Yd))
  for (let i = 0; i < 3; i++) body.add(at(box(.4, .02, .06, dark), -.62, .63, -.3 + i * .15))
  body.add(at(prof([[-.2, .42], [.52, .42], [.6, 1.25], [.46, 1.38], [-.2, 1.38]], .62, Y), 0, 0, .27))
  body.add(at(prof([[-.12, .66], [.6, .66], [.64, 1.2], [.5, 1.3], [-.12, 1.3]], .645, V.glass, .008), 0, 0, .27))
  body.add(at(box(.86, .05, .66, Yd, .02), .16, 1.38, .27))
  body.add(at(cyl(.05, .05, .44, dark, 8), -.55, .6, -.35)); body.add(at(cyl(.065, .05, .07, dark, 8), -.55, 1.03, -.35))
  body.add(at(box(.05, .06, .12, V.head), .72, .3, .4))
  upper.add(bake(body))
  const puffs: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) { const p = ball(.08, std({ color: 0xffffff, transparent: true, opacity: .8, flatShading: true })); upper.add(p); puffs.push(p) }
  const boomP = new THREE.Group(); boomP.position.set(.5, .45, -.24); upper.add(boomP)
  boomP.add(bake(grp(prof([[-.1, -.1], [.1, -.12], [.75, .6], [1.35, .64], [1.35, .84], [.6, .82], [-.1, .1]], .2, Y), rod([.05, -.08, .12], [.6, .45, .12], .045, V.chrome), rod([.05, -.08, -.12], [.6, .45, -.12], .045, V.chrome))))
  const stickP = new THREE.Group(); stickP.position.set(1.3, .74, 0); boomP.add(stickP)
  stickP.add(bake(grp(prof([[-.09, .12], [.1, .14], [.07, -1.05], [-.07, -1.05]], .16, Y), rod([-.2, .2, 0], [-.12, -.4, 0], .04, V.chrome))))
  const bucketP = new THREE.Group(); bucketP.position.set(0, -1.02, 0); stickP.add(bucketP)
  const bucket = grp(prof([[-.06, .05], [.08, .02], [.34, -.28], [.16, -.42], [-.18, -.36], [-.14, -.08]], .5, dark))
  for (let i = 0; i < 4; i++) bucket.add(at(box(.07, .1, .06, K), .21, -.46, -.18 + i * .12))
  bucketP.add(bake(bucket))
  root.userData.anim = (t: number) => {
    upper.rotation.y = Math.sin(t * .5) * .35
    boomP.rotation.z = .05 + Math.sin(t * 1.2) * .22; stickP.rotation.z = -.35 + Math.sin(t * 1.2 + 1) * .35; bucketP.rotation.z = .2 + Math.sin(t * 1.2 + 2) * .5
    puffs.forEach((p, i) => { const ph = (t * .8 + i / 4) % 1; p.position.set(-.55 - ph * .35, 1.08 + ph * .7, -.35); p.scale.setScalar(.6 + ph * 1.6); (p.material as THREE.MeshStandardMaterial).opacity = (1 - ph) * .85 })
  }
  return root
}

export function loader() {
  const Y = P(0xf3c93a), Yd = P(0xdcab1e), D = P(0x34363c)
  const root = new THREE.Group(), fixed = new THREE.Group()
  for (const x of [-.75, .62]) for (const z of [-.58, .58]) fixed.add(at(wheel(.42, .34, Y, true), x, .42, z))
  fixed.add(at(box(2.1, .3, .7, D), -.1, .35, 0))
  fixed.add(prof([[-1.35, .5], [-.15, .5], [-.15, 1.05], [-1.25, 1.05], [-1.42, .8]], .95, Y))
  for (let i = 0; i < 2; i++) fixed.add(at(box(.3, .03, .14, D), -.95 + i * .4, 1.06, .2))
  fixed.add(at(box(.05, .28, .6, D), -1.42, .6, 0))
  for (const z of [-.58, .58]) { fixed.add(at(prof([[-1.22, 0], [-.28, 0], [-.34, .08], [-1.16, .08]], .42, Yd), 0, .88, z)); fixed.add(at(prof([[.2, 0], [1.02, 0], [.96, .07], [.26, .07]], .4, Yd), 0, .86, z)) }
  fixed.add(at(box(.7, .35, .55, Yd), .45, .5, 0))
  fixed.add(prof([[-.55, 1.0], [.18, 1.0], [.24, 1.75], [-.55, 1.8]], .82, Y))
  fixed.add(prof([[-.48, 1.12], [.27, 1.12], [.31, 1.66], [-.48, 1.7]], .84, V.glass, .008))
  fixed.add(at(box(.95, .1, .95, Y, .03), -.17, 1.8, 0))
  fixed.add(at(cyl(.04, .04, .3, D, 6), -1.05, 1.05, -.3))
  root.add(bake(fixed))
  const armP = new THREE.Group(); armP.position.set(.35, 1.0, 0); root.add(armP)
  const arms = new THREE.Group()
  for (const z of [-.34, .34]) arms.add(at(prof([[0, -.08], [0, .08], [1.05, -.3], [1.05, -.5], [.92, -.5]], .12, D), 0, 0, z))
  arms.add(at(box(.12, .12, .8, D), .6, -.27, 0)); arms.add(rod([.05, -.32, 0], [.7, -.18, 0], .05, V.chrome))
  armP.add(bake(arms))
  const bkP = new THREE.Group(); bkP.position.set(1.0, -.45, 0); armP.add(bkP)
  const bk = grp(prof([[-.07, .42], [0, .42], [0, -.18], [.62, -.26], [.62, -.32], [-.07, -.27]], 1.3, D))
  for (const z of [-.64, .64]) bk.add(at(prof([[0, .42], [0, -.24], [.6, -.28]], .05, D, .005), 0, 0, z))
  bkP.add(bake(bk))
  root.userData.anim = (t: number) => { const k = Math.sin(t * 1.1) * .5 + .5; armP.rotation.z = -.15 + k * .55; bkP.rotation.z = .12 - k * .45 }
  return root
}

function cabOver(color: number, x1 = 1.95, x0 = 1.05, w = 1.15) {
  const B = P(color), g = new THREE.Group(), D = P(0x2e3035)
  g.add(prof([[x0, .52], [x1, .52], [x1, 1.05], [x1 - .09, 1.68], [x0, 1.72]], w, B))
  g.add(prof([[x1 - .33, 1.08], [x1 + .04, 1.08], [x1 - .05, 1.6], [x1 - .33, 1.6]], w - .1, V.tint, .008))
  g.add(prof([[x0 + .2, 1.1], [x1 - .35, 1.1], [x1 - .35, 1.55], [x0 + .2, 1.55]], w + .02, V.tint, .008))
  g.add(at(box(.05, .26, w * .7, D), x1 + .03, .72, 0))
  for (const z of [-w * .4, w * .4]) g.add(at(box(.04, .09, .17, V.head), x1 + .06, .52, z))
  for (const z of [-1, 1]) { g.add(at(box(.3, .03, .03, D), x1 - .05, 1.35, z * w * .5)); g.add(at(box(.05, .26, .1, D), x1 + .06, 1.2, z * (w * .5 + .08))) }
  return g
}

export function mixer() {
  const Wt = P(0xf3f2ee), Y = P(0xf4b62e), K = V.steel, D = P(0x2e3035)
  const root = new THREE.Group(), fixed = new THREE.Group()
  fixed.add(at(box(3.7, .22, .62, D), -.1, .42, 0))
  for (const x of [1.45, -.85, -1.45]) for (const z of [-.5, .5]) fixed.add(at(wheel(.3, .26), x, .3, z))
  fixed.add(cabOver(0xf3f2ee))
  fixed.add(at(box(.16, .3, 1.2, Y, .03), 1.97, .38, 0))
  fixed.add(at(axisX(new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .5, 10), K)), .8, .62, .46))
  fixed.add(at(axisZ(new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .85, 10), P(0x9a9ea6))), .85, 1.2, 0))
  for (const z of [-.5, .5]) fixed.add(at(box(1.25, .07, .32, Y, .02), -1.15, .62, z))
  fixed.add(at(box(.1, .7, .6, K), .55, .6, 0)); fixed.add(at(box(.1, 1.15, .5, K), -1.6, .6, 0))
  fixed.add(at(prof([[-.25, 0], [.05, 0], [.22, .38], [-.38, .38]], .52, Y), -1.82, 1.62, 0))
  const chute = box(.55, .04, .26, Y); chute.rotation.z = .9; fixed.add(at(chute, -2.05, 1.05, 0))
  for (const z of [.22, .48]) fixed.add(at(box(.03, 1.25, .03, K), -1.92, .55, z))
  for (let i = 0; i < 6; i++) fixed.add(at(box(.03, .03, .26, K), -1.92, .7 + i * .2, .35))
  root.add(bake(fixed))
  const drumP = new THREE.Group(); drumP.position.set(.45, 1.32, 0); drumP.rotation.z = Math.PI / 2 - .22; root.add(drumP)
  const prf: [number, number][] = [[0, 0], [.32, 0], [.58, .45], [.66, 1.0], [.6, 1.55], [.32, 2.05], [.2, 2.15], [0, 2.15]]
  const rAt = (y: number) => {
    for (let i = 1; i < prf.length; i++) {
      const [r0, y0] = prf[i - 1]!, [r1, y1] = prf[i]!
      if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1)
    }
    return 0
  }
  const drum = new THREE.Group()
  drum.add(new THREE.Mesh(new THREE.LatheGeometry(prf.map(([r, y]) => new THREE.Vector2(r, y)), 10), Wt))
  for (const [y0, y1] of [[.7, .92], [1.42, 1.64]] as const) drum.add(at(new THREE.Mesh(new THREE.CylinderGeometry(rAt(y1) + .015, rAt(y0) + .015, y1 - y0, 10, 1, true), Y), 0, (y0 + y1) / 2, 0))
  drumP.add(drum)
  root.userData.anim = (t: number) => { drum.rotation.y = t * 1.6 }
  return root
}

function wheelsAt(g: THREE.Group, xs: number[], z: number, r: number, w: number, rim?: THREE.Material) { for (const x of xs) for (const s of [-1, 1]) g.add(at(wheel(r, w, rim), x, r, s * z)) }
function carBits(g: THREE.Group, len: number, w: number, y: number) {
  for (const s of [-1, 1]) { g.add(at(box(.03, .06, .14, V.head), len / 2 + .01, y, s * w * .34)); g.add(at(box(.03, .06, .14, V.tail), -len / 2 - .01, y, s * w * .34)) }
  g.add(at(box(.08, .1, w + .02, V.steel, .02), len / 2, .13, 0)); g.add(at(box(.08, .1, w + .02, V.steel, .02), -len / 2, .13, 0))
}
export function sedan(c: number) {
  const B = P(c), g = new THREE.Group()
  g.add(prof([[-1, .14], [1, .14], [1.03, .36], [.56, .46], [-.82, .48], [-1.03, .38]], .8, B))
  g.add(prof([[.5, .46], [.14, .76], [-.52, .76], [-.8, .48]], .72, V.tint, .008))
  g.add(at(box(.68, .04, .7, B, .015), -.19, .76, 0)); g.add(at(box(.07, .29, .73, B), -.18, .47, 0))
  carBits(g, 2.06, .8, .32); wheelsAt(g, [.6, -.62], .36, .17, .14)
  return g
}
export function hatch(c: number) {
  const B = P(c), g = new THREE.Group()
  g.add(prof([[-.82, .14], [.9, .14], [.93, .36], [.5, .46], [-.8, .5], [-.86, .3]], .8, B))
  g.add(prof([[.45, .46], [.12, .78], [-.66, .8], [-.78, .5]], .72, V.tint, .008))
  g.add(at(box(.76, .04, .7, B, .015), -.26, .79, 0)); g.add(at(box(.07, .3, .73, B), -.12, .48, 0))
  carBits(g, 1.8, .8, .32); wheelsAt(g, [.52, -.5], .36, .17, .14)
  return g
}
export function pickup(c: number) {
  const B = P(c), g = new THREE.Group()
  g.add(prof([[-1.05, .14], [1.05, .14], [1.08, .4], [.6, .5], [-1.05, .5]], .82, B))
  g.add(prof([[.55, .5], [.25, .85], [-.25, .85], [-.3, .5]], .74, V.tint, .008))
  g.add(at(box(.52, .04, .72, B, .015), 0, .85, 0))
  g.add(at(box(.72, .02, .7, P(0x3a3d45)), -.66, .48, 0))
  carBits(g, 2.1, .82, .36); wheelsAt(g, [.65, -.62], .37, .19, .15)
  return g
}
export function van(c: number) {
  const B = P(c), g = new THREE.Group()
  g.add(prof([[-1.05, .14], [1.05, .14], [1.08, .48], [.72, .98], [-1.05, 1.02]], .86, B))
  g.add(prof([[.98, .55], [1.06, .55], [.72, .92], [.62, .92]], .8, V.tint, .008))
  g.add(prof([[.15, .62], [.6, .62], [.6, .9], [.15, .9]], .88, V.tint, .008))
  carBits(g, 2.1, .86, .4); wheelsAt(g, [.66, -.66], .38, .19, .15)
  return g
}
export function bus() {
  const B = P(0xf2c234), g = new THREE.Group()
  g.add(prof([[-1.8, .2], [1.8, .2], [1.82, 1.25], [1.7, 1.38], [-1.8, 1.38]], 1.0, B))
  g.add(at(box(3.2, .38, 1.02, V.tint), -.15, .8, 0)); g.add(at(box(.04, .5, .85, V.tint), 1.82, .72, 0))
  g.add(at(box(3.62, .06, 1.02, P(0x2e3035)), 0, .62, 0))
  carBits(g, 3.62, 1, .45); wheelsAt(g, [1.2, -1.15], .45, .22, .16)
  return g
}
export function boxTruck(c: number) {
  const g = new THREE.Group()
  g.add(at(box(3.4, .2, .6, P(0x2e3035)), .05, .3, 0)); wheelsAt(g, [1.25, -.9], .48, .26, .2)
  g.add(cabOver(c, 1.75, 1.0, 1.0))
  g.add(at(box(2.5, 1.35, 1.06, P(0xf1efe9), .03), -.35, .5, 0)); g.add(at(box(.04, .04, 1.08, P(c)), -.35, 1.1, 0))
  return g
}
export function flatbed(c: number) {
  const g = new THREE.Group(), wood = M().wood
  g.add(at(box(3.4, .2, .6, P(0x2e3035)), .05, .3, 0)); wheelsAt(g, [1.25, -.9], .48, .26, .2)
  g.add(cabOver(c, 1.75, 1.0, 1.0))
  g.add(at(box(2.5, .1, 1.06, wood), -.35, .5, 0))
  g.add(at(box(.9, .5, .7, std({ map: rep(T().brick, 1, 1) })), -.7, .6, 0)); g.add(at(box(.6, .4, .6, P(0xe8e2d4), .04), .3, .6, 0))
  return g
}
export function fireTruck() {
  const R = P(0xc8352a), g = new THREE.Group()
  g.add(at(box(3.6, .2, .6, P(0x2e3035)), 0, .3, 0)); wheelsAt(g, [1.3, -.7, -1.25], .5, .27, .2)
  g.add(cabOver(0xc8352a, 1.85, 1.05, 1.04))
  g.add(at(box(2.6, 1.0, 1.06, R, .03), -.3, .5, 0))
  for (let i = 0; i < 4; i++) g.add(at(box(.5, .7, .02, P(0xd9dadc)), -1.3 + i * .62, .62, .54))
  g.add(at(box(.3, .08, .8, P(0x2e6fd6)), 1.4, 1.73, 0))
  g.add(at(box(3, .06, .1, V.chrome), -.3, 1.6, .25)); g.add(at(box(3, .06, .1, V.chrome), -.3, 1.6, -.25))
  for (let i = 0; i < 9; i++) g.add(at(box(.04, .04, .5, V.chrome), -1.6 + i * .33, 1.6, 0))
  return g
}
export type VehicleKind = 'car' | 'van' | 'bus' | 'fire' | 'flatbed' | 'truck'
export function vehicle(c: number, kind: VehicleKind = 'car'): THREE.Group {
  let g: THREE.Group
  if (kind === 'car') g = pick([sedan, hatch, pickup])(c)
  else if (kind === 'van') g = van(c)
  else if (kind === 'bus') g = bus()
  else if (kind === 'fire') g = fireTruck()
  else if (kind === 'flatbed') g = flatbed(c)
  else g = boxTruck(c)
  g.scale.setScalar(.8)
  return g
}
