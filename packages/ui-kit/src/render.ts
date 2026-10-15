import type { SceneSpec } from '@sidecar/shared'
import { GROUND_Y, VIEW } from './layout'
import { actor } from './pieces/actors'
import { effect } from './pieces/effects'
import { place } from './pieces/places'
import { prop } from './pieces/props'
import { esc, g } from './svg'
import { color } from './tokens'
import { compile, frameAt, type Timeline } from './timeline'
import type { Town } from './town'

export interface RenderOptions {
  town?: Town
  /** Pass a precompiled timeline when rendering many frames of one spec. */
  timeline?: Timeline
}

const BACKDROP = `<rect width="${VIEW.w}" height="${VIEW.h}" fill="${color('sky')}"/>`
  + `<rect y="${GROUND_Y}" width="${VIEW.w}" height="${VIEW.h - GROUND_Y}" fill="${color('ground')}"/>`
  + `<line x1="0" y1="${GROUND_Y}" x2="${VIEW.w}" y2="${GROUND_Y}" stroke="${color('ink')}" stroke-width="3"/>`

/** Draw `spec` at time `t` (ms) as a standalone SVG string. Pure and deterministic. */
export function render(spec: SceneSpec, t: number, opts: RenderOptions = {}): string {
  const f = frameAt(spec, opts.timeline ?? compile(spec), t, opts)
  const floors = opts.town?.appFloors ?? 1
  const places = [...f.places]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((p) => g(p.x, p.y, place(p.id, { floors, ...(p.label ? { label: p.label } : {}) })))
    .join('')
  const cables = f.props.filter((p) => p.kind === 'cable').map((p) => prop(p, f.t)).join('')
  const actors = [...f.actors].sort((a, b) => a.y - b.y).map((a) => g(a.x, a.y, actor(a, f.t))).join('')
  const held = f.props.filter((p) => p.kind !== 'cable').map((p) => prop(p, f.t)).join('')
  const effects = f.fx.map((e) => g(e.x, e.y, effect(e.id, e.p, f.t))).join('')
  const title = esc(spec.caption)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" class="sk-scene" role="img" aria-label="${title}">`
    + `<title>${title}</title>${BACKDROP}${places}${cables}${actors}${held}${effects}</svg>`
}
