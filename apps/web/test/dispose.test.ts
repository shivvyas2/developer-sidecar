import * as THREE from 'three'
import { expect, test } from 'vitest'
import { col, disposeTree, std } from '../src/city/kit/core'

const watch = (o: { addEventListener(t: 'dispose', f: () => void): void }) => { const w = { done: false }; o.addEventListener('dispose', () => { w.done = true }); return w }

test('disposeTree frees what a scene made, and leaves shared materials and textures alone', () => {
  const shared = col(0x123456)
  const sharedTex = new THREE.Texture(); sharedTex.userData.cached = true
  const own = std({ map: new THREE.Texture() })
  const borrows = std({ map: sharedTex })
  const geo = new THREE.BoxGeometry()
  const g = new THREE.Group()
  g.add(new THREE.Mesh(geo, own), new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Mesh(new THREE.BoxGeometry(), [borrows, shared]))
  const w = { geo: watch(geo), own: watch(own), ownMap: watch(own.map!), shared: watch(shared), sharedTex: watch(sharedTex), borrows: watch(borrows) }
  disposeTree(g)
  expect(w.geo.done).toBe(true)
  expect(w.own.done).toBe(true)
  expect(w.ownMap.done).toBe(true)
  expect(w.borrows.done).toBe(true)
  expect(w.shared.done).toBe(false)
  expect(w.sharedTex.done).toBe(false)
})
