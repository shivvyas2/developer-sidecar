import { sessionArc } from '../primitives/arc'
import { unit01 } from '../primitives/dial'
import { readout } from '../primitives/readout'
import { statusStrip } from '../primitives/strip'
import { fit, mono } from '../primitives/text'
import { VIEW } from '../layout'
import { color } from '../tokens'
import type { Readout, SceneCtx } from './context'
import { pad } from './layout'

const EMPTY: Readout = { step: 0, files: 0, now: '', elapsed: '00:00', live: false }
const CHECKS = { pass: 'PASS', fail: 'FAIL', none: '-' } as const
const LIGHT = { ok: 'blockOk', alert: 'accent', busy: 'label' } as const
/**
 * The session ring: left of centre and small enough that the framed dial sits well
 * outside it (see FRAMED in layout.ts). It is drawn only above the status strip.
 */
export const ARC = { c: { x: 190, y: 252 }, r: 150 } as const
export const STRIP_Y = VIEW.h - 22
/** The ring stops this far above the strip's rule. */
const ARC_FLOOR = STRIP_Y - 6
const M = 24

const values = (ctx: SceneCtx) => ctx.readout ?? EMPTY

/** Behind the sheet: the header, the session arc and the status light. */
export function frameBack(ctx: SceneCtx): string {
  const r = values(ctx)
  const ink = color('ink')
  const session = unit01(r.session ?? 0)
  // With a project the page header already names the product, so the sheet names the project only.
  const header = mono(M, 24, 8, ink, r.project?.trim() ? fit(r.project.toUpperCase(), 22) : 'DEVELOPER SIDECAR', { weight: 700, spacing: 1.8 })
  const status = r.status?.trim()
    ? mono(M, 104, 7, ink, 'STATUS', { weight: 700, spacing: 1.6 })
      + `<rect class="sk-light sk-light--${r.light ?? 'ok'}" x="${M}" y="111" width="8" height="8" fill="${color(LIGHT[r.light ?? 'ok'])}" stroke="${ink}" stroke-width=".8"/>`
      + mono(M + 13, 118, 6.5, ink, fit(r.status.toUpperCase(), 14), { weight: 600, spacing: 1.2 })
    : ''
  return `<g class="sk-frame sk-frame--back">`
    + header
    + sessionArc(ARC.c, ARC.r, session, { floor: ARC_FLOOR })
    + status
    + `</g>`
}

/** In front of the sheet: the readout panel and the status strip. */
export function frameFront(ctx: SceneCtx): string {
  const r = values(ctx)
  const panel = ctx.slots.panel ?? { at: { x: 440, y: 20 }, w: 178 }
  const step = pad(r.step, 3)
  const caption = ctx.spec.caption.trim()
  return `<g class="sk-frame sk-frame--front">`
    + readout(panel.at, panel.w,
      [{ k: 'STEP', v: step, big: true }, { k: 'MADE', v: pad(r.files, 2) }, { k: 'CHECKS', v: CHECKS[r.checks ?? 'none'] }],
      [{ k: 'NOW', v: r.now.trim() || '-' }, { k: 'ELAPSED', v: r.elapsed.trim() || '00:00' }])
    + statusStrip({ x: M, y: STRIP_Y }, VIEW.w - 2 * M, { text: caption ? `STEP ${step} · ${caption}` : `STEP ${step}`, live: r.live, ...(r.tag ? { tag: r.tag } : {}) })
    + `</g>`
}
