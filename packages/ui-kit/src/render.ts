import type { SceneSpec } from '@sidecar/shared'
import { VIEW } from './layout'
import { gridPaper } from './primitives/grid'
import { animatorFor, townState } from './scene/animators'
import { makeCtx, type Readout } from './scene/context'
import { frameBack, frameFront } from './scene/frame'
import { town } from './scene/layout'
import { esc } from './svg'
import { compile, type Timeline } from './timeline'
import { color } from './tokens'
import type { Town } from './town'

export type { Readout }

export interface RenderOptions {
  town?: Town
  /** Pass a precompiled timeline when rendering many frames of one spec. */
  timeline?: Timeline
  /** Draw the stage frame: header, session arc, readout panel and status strip. */
  frame?: boolean
  /** The frame's numbers; only drawn with `frame`. */
  readout?: Readout
}

/** Draw `spec` at time `t` (ms) as a standalone SVG string. Pure and deterministic. */
export function render(spec: SceneSpec, t: number, opts: RenderOptions = {}): string {
  const timeline = opts.timeline ?? compile(spec)
  const ctx = makeCtx(spec, timeline, t, {
    ...(opts.town ? { town: opts.town } : {}),
    ...(opts.frame ? { frame: true } : {}),
    ...(opts.readout ? { readout: opts.readout } : {}),
  })
  const title = esc(spec.caption)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" class="sk-scene" role="img" aria-label="${title}">`
    + `<title>${title}</title>`
    + `<rect width="${VIEW.w}" height="${VIEW.h}" fill="${color('paper')}"/>`
    + gridPaper(VIEW.w, VIEW.h)
    + (opts.frame ? frameBack(ctx) : '')
    + town(ctx, townState(ctx))
    + animatorFor(spec.scene)(ctx)
    + (opts.frame ? frameFront(ctx) : '')
    + `</svg>`
}
