import * as THREE from 'three'
import { GROWTH_STAGES, type CityTown, type GrowthStage } from '@sidecar/shared'
import { at, bake, box, canvasTex, col, grp, rand, reseed, rep, std, tube } from './kit/core'
import { fillerBuilding, makeBuilding, type BuildingView } from './kit/buildings'
import { cypress, groundPatch, lamp, pallet, pole, tree } from './kit/props'
import { M, T } from './kit/textures'
import { excavator, loader, mixer } from './kit/vehicles'
import { ISLAND_HALF, ROAD_HALF, ROAD_Z, plotTown, type Plot } from './layout'

/**
 * Draws the town in three.js from the city model. It decides nothing: the shared city functions say what
 * stands and how it is finished; this only builds each building once and shows the right look.
 */

export type CityTheme = 'light' | 'dark'
export interface CityRendererOptions { theme: CityTheme; reducedMotion: boolean }

const OFFSET = new THREE.Vector3(40, 33, 40)
const VIEW = 24
const reached = (stage: GrowthStage, at: GrowthStage) => GROWTH_STAGES.indexOf(stage) >= GROWTH_STAGES.indexOf(at)

interface Placed { view: BuildingView; plot: Plot; born: number }

export class CityRenderer {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 500)
  protected readonly renderer: THREE.WebGLRenderer
  protected readonly placed = new Map<string, Placed>()
  protected readonly target = new THREE.Vector3()
  protected wantTarget = new THREE.Vector3()
  protected wantZoom = 2
  protected clock = 0
  protected theme: CityTheme
  protected reducedMotion: boolean
  protected town: CityTown | null = null
  protected raf = 0
  protected last = 0
  protected readonly hemi = new THREE.HemisphereLight(0xd4e6f5, 0xb39a72, 1.05)
  protected readonly sun = new THREE.DirectionalLight(0xffe0b5, 2.7)
  protected readonly lampLight = std({ color: 0xfff1c6, emissive: 0xfff1c6, emissiveIntensity: 0.35 })
  protected readonly dressing: Record<'dig' | 'supplies' | 'pour' | 'roads' | 'filler', THREE.Group> = {
    dig: new THREE.Group(), supplies: new THREE.Group(), pour: new THREE.Group(), roads: new THREE.Group(), filler: new THREE.Group(),
  }
  protected readonly machines: THREE.Object3D[] = []
  protected fillerFor = ''
  protected readonly onFrame: ((t: number, dt: number) => void)[] = []

  constructor(readonly canvas: HTMLCanvasElement, opts: CityRendererOptions) {
    this.theme = opts.theme
    this.reducedMotion = opts.reducedMotion
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(4096, 4096)
    Object.assign(this.sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 160 })
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.03
    this.scene.add(this.hemi, this.sun, ...Object.values(this.dressing))
    this.buildIsland()
    this.buildDressing()
    this.setTheme(opts.theme)
    this.camera.zoom = this.wantZoom
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  protected buildIsland() {
    const t = T(), size = ISLAND_HALF * 2
    const earth = std({ map: t.earth })
    const ground = new THREE.Mesh(new THREE.BoxGeometry(size, 5, size), [earth, earth, std({ map: t.grass }), col(0x5a4330), earth, earth])
    ground.position.y = -2.5; ground.receiveShadow = true; ground.name = 'ground'
    this.scene.add(ground)
  }

  protected buildDressing() {
    const m = M(), t = T()
    reseed(23)
    // digging: a patch of dirt with stakes and string at the first shop plot, and the excavator
    const dig = this.dressing.dig
    dig.add(bake(grp(groundPatch(8, 7, 'dirt'), ...[[-3.5, -3], [3.5, -3], [3.5, 3], [-3.5, 3]].map(([x, z]) => at(box(0.07, 0.5, 0.07, m.wood), x!, 0, z!)),
      at(box(7, 0.015, 0.015, col(0xf4f0e6)), 0, 0.42, 3), at(box(0.015, 0.015, 6, col(0xf4f0e6)), 3.5, 0.42, 0))))
    const ex = at(excavator(), 5.6, 0, 3, 0.45); dig.add(ex); this.machines.push(ex)
    // supplies arriving: pallets and the loader by the site office
    const sup = this.dressing.supplies
    sup.add(bake(grp(at(pallet('brick'), -9, 0, 3.2), at(pallet('brick'), -7.9, 0, 3.2), at(pallet('cement'), -9, 0, 4.2))))
    const lo = at(loader(), -11.5, 0, 1.5, 0.9); sup.add(lo); this.machines.push(lo)
    // the first concrete pour
    const mx = at(mixer(), 6.6, 0, 4.4, 0.35); this.dressing.pour.add(mx); this.machines.push(mx)
    // roads, power lines and lamps
    const roads = this.dressing.roads, len = ISLAND_HALF * 2 - 1, RW = 4.4, SW = (ROAD_HALF * 2 - RW) / 2
    const rg = new THREE.Group()
    rg.add(at(box(len, 0.04, RW, std({ map: rep(t.asphalt, len / 12, RW / 12) })), 0, 0, ROAD_Z))
    for (const side of [-1, 1]) {
      rg.add(at(box(len, 0.15, SW, std({ map: rep(t.pavers, len / 1.4, 1) })), 0, 0, ROAD_Z + side * (RW / 2 + SW / 2)))
      rg.add(at(box(len, 0.17, 0.1, m.sill), 0, 0, ROAD_Z + side * (RW / 2 + 0.05)))
    }
    for (let x = -len / 2 + 1.5; x < len / 2; x += 3) rg.add(at(box(1.2, 0.046, 0.12, col(0xece6d6)), x, 0, ROAD_Z))
    for (let k = 0; k < 6; k++) rg.add(at(box(1.1, 0.046, 0.34, col(0xece6d6)), 3.75, 0, ROAD_Z - RW / 2 + 0.45 + k * 0.7))
    roads.add(bake(rg))
    const lines = new THREE.Group(), poleZ = ROAD_Z - ROAD_HALF + 0.3, xs = [-33.75, -18.75, -3.75, 11.25, 26.25]
    for (const x of xs) lines.add(at(pole(), x, 0, poleZ))
    for (let i = 0; i < xs.length - 1; i++) for (const dz of [-0.45, 0, 0.45]) {
      lines.add(tube(new THREE.Vector3(xs[i]!, 3.8, poleZ + dz), new THREE.Vector3(xs[i + 1]!, 3.8, poleZ + dz), 0.35, 0.018, m.wire))
    }
    for (const x of [-30, -15, 0, 15, 30]) lines.add(at(lamp(this.lampLight), x, 0, ROAD_Z + ROAD_HALF - 0.3, Math.PI / 2))
    for (const [x, z] of [[-44, 3], [44, 3], [-44, 14], [44, 14]] as const) lines.add(at(rand() < 0.5 ? tree(1) : cypress(1.2), x, 0, z))
    roads.add(bake(lines))
  }

  protected buildFiller(plots: Map<string, Plot>) {
    const key = [...plots.keys()].join('|')
    if (key === this.fillerFor) return
    this.fillerFor = key
    const g = this.dressing.filler
    for (const c of [...g.children]) g.remove(c)
    reseed(97)
    const taken = [...plots.values()]
    const free = (x: number, z: number) => Math.abs(z - ROAD_Z) > ROAD_HALF + 3.2 &&
      !taken.some((p) => Math.abs(x - p.x) < p.w / 2 + 3.4 && Math.abs(z - p.z) < p.d / 2 + 3.4)
    for (let x = -43; x <= 43; x += 7.2) for (let z = -43; z <= 43; z += 7.2) {
      const px = x + (rand() - 0.5) * 0.8, pz = z + (rand() - 0.5) * 0.8
      if (!free(px, pz)) continue
      const r = rand()
      if (r < 0.14) { for (let k = 0; k < 3; k++) g.add(at(rand() < 0.5 ? tree(0.9 + rand() * 0.4) : cypress(1.1), px + (rand() - 0.5) * 4, 0, pz + (rand() - 0.5) * 4)); continue }
      g.add(at(fillerBuilding(r < 0.5 ? 'house' : r < 0.85 ? 'apartment' : 'shop', Math.hypot(px, pz) < 26), px, 0, pz))
    }
  }

  setTheme(theme: CityTheme) {
    this.theme = theme
    const dark = theme === 'dark'
    const sky = canvasTex(16, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 512)
      if (dark) { gr.addColorStop(0, '#1f2747'); gr.addColorStop(0.5, '#4a3f62'); gr.addColorStop(0.85, '#b9735a'); gr.addColorStop(1, '#e0a06a') }
      else { gr.addColorStop(0, '#86b9df'); gr.addColorStop(0.45, '#bcdcef'); gr.addColorStop(0.8, '#f1e6cf'); gr.addColorStop(1, '#ecd7b0') }
      g.fillStyle = gr; g.fillRect(0, 0, 16, 512)
    })
    this.scene.background = sky
    this.hemi.intensity = dark ? 0.55 : 1.05
    this.hemi.color.set(dark ? 0x8a8fc0 : 0xd4e6f5)
    this.sun.color.set(dark ? 0xff9a5c : 0xffe0b5)
    this.sun.intensity = dark ? 1.5 : 2.7
    this.sun.position.set(dark ? 40 : 34, dark ? 14 : 26, dark ? 4 : 12)
    this.lampLight.emissiveIntensity = dark ? 1.6 : 0.35
    this.renderer.toneMappingExposure = dark ? 1.1 : 1.0
  }

  setReducedMotion(on: boolean) { this.reducedMotion = on }

  setTown(town: CityTown) {
    this.town = town
    const plots = plotTown(town)
    const seen = new Set<string>()
    for (const b of town.buildings) {
      const plot = plots.get(b.id)
      if (!plot) continue
      seen.add(b.id)
      let p = this.placed.get(b.id)
      if (!p || p.plot.w !== plot.w || p.plot.x !== plot.x || p.plot.z !== plot.z) {
        if (p) this.scene.remove(p.view.root)
        reseed(b.id.length * 131 + 7)
        const view = makeBuilding(b, plot.w, plot.d)
        at(view.root, plot.x, 0, plot.z, plot.ry)
        p = { view, plot, born: this.reducedMotion ? -10 : this.clock }
        this.placed.set(b.id, p)
      }
      if (!p.view.root.parent) { this.scene.add(p.view.root); p.born = this.reducedMotion ? -10 : this.clock }
      p.view.setFinish(b.finish)
      p.view.setLit(b.lit)
    }
    for (const [id, p] of this.placed) if (!seen.has(id) && p.view.root.parent) this.scene.remove(p.view.root)

    const s = town.stage, hasShopAtCentre = [...plots.entries()].some(([id, p]) => id.startsWith('shop:') && p.x === 0 && p.z === 0)
    this.dressing.dig.visible = (s === 'dig' || s === 'foundation') && !hasShopAtCentre
    this.dressing.supplies.visible = s === 'foundation' || s === 'bricks'
    this.dressing.pour.visible = s === 'concrete'
    this.dressing.roads.visible = reached(s, 'neighbourhood')
    this.dressing.filler.visible = s === 'town'
    if (s === 'town') this.buildFiller(plots)
    this.fit(plots)
  }

  /** Rests the camera on the whole town: the plots' corners, projected the way the camera sees them, fill most of the view. */
  protected fit(plots: Map<string, Plot>) {
    if (this.town?.stage === 'town') { this.wantTarget.set(0, 0, 0); this.wantZoom = 0.42; return }
    const ps = [...plots.values()]
    if (this.dressing.dig.visible || this.dressing.pour.visible) ps.push({ x: 4, z: 3, w: 10, d: 8, ry: 0 })
    if (this.dressing.supplies.visible) ps.push({ x: -10, z: 2.5, w: 5, d: 5, ry: 0 })
    if (!ps.length) { this.wantTarget.set(0, 0, 0); this.wantZoom = 2.2; return }
    const x0 = Math.min(...ps.map((p) => p.x - p.w / 2)), x1 = Math.max(...ps.map((p) => p.x + p.w / 2))
    const z0 = Math.min(...ps.map((p) => p.z - p.d / 2)), z1 = Math.max(...ps.map((p) => p.z + p.d / 2))
    const centre = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2)
    const view = new THREE.Matrix4().lookAt(centre.clone().add(OFFSET), centre, new THREE.Vector3(0, 1, 0)).invert()
    const rot = new THREE.Matrix4().extractRotation(view)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [0, 4]) {
      const q = new THREE.Vector3(x - centre.x, y, z - centre.z).applyMatrix4(rot)
      u0 = Math.min(u0, q.x); u1 = Math.max(u1, q.x); v0 = Math.min(v0, q.y); v1 = Math.max(v1, q.y)
    }
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)
    this.wantTarget.copy(centre)
    this.wantZoom = Math.max(0.42, Math.min(2.4, 0.86 * Math.min((VIEW * aspect) / (u1 - u0), VIEW / (v1 - v0))))
  }

  resize(w: number, h: number) {
    const a = w / Math.max(1, h)
    Object.assign(this.camera, { left: -VIEW * a / 2, right: VIEW * a / 2, top: VIEW / 2, bottom: -VIEW / 2 })
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    if (this.town) this.fit(plotTown(this.town))
  }

  protected loop(now: number) {
    this.raf = requestAnimationFrame(this.loop)
    if (document.hidden) { this.last = now; return }
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now; this.clock += dt
    const ease = (k: number) => 1 + 2.5 * Math.pow(k - 1, 3) + 1.5 * Math.pow(k - 1, 2)
    for (const p of this.placed.values()) {
      if (!p.view.root.parent) continue
      const k = Math.min(1, (this.clock - p.born) * 1.8)
      p.view.root.scale.setScalar(k >= 1 ? 1 : Math.max(0.001, ease(k)))
      p.view.tick(this.clock)
    }
    if (!this.reducedMotion) for (const m of this.machines) if (m.parent?.visible) (m.userData.anim as ((t: number) => void) | undefined)?.(this.clock)
    for (const f of this.onFrame) f(this.clock, dt)
    const k = Math.min(1, dt * (this.reducedMotion ? 20 : 1.6))
    this.target.lerp(this.wantTarget, k)
    this.camera.zoom += (this.wantZoom - this.camera.zoom) * k
    this.camera.position.copy(this.target).add(OFFSET); this.camera.lookAt(this.target); this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
  }
}
