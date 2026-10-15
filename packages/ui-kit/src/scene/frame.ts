import { sessionArc } from '../primitives/arc'
import { unit01 } from '../primitives/dial'
import { readout } from '../primitives/readout'
import { statusStrip } from '../primitives/strip'
import { fit, mono } from '../primitives/text'
import { n } from '../svg'
import { VIEW } from '../layout'
import { color } from '../tokens'
import { fmtTokens } from '../format'
import type { Readout, SceneCtx } from './context'
import { pad } from './layout'

const EMPTY: Readout = { step: 0, files: 0, tokens: 0, now: '', elapsed: '00:00', live: false }
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

/** Behind the sheet: the header, the session arc and the session gauge. */
export function frameBack(ctx: SceneCtx): string {
  const r = values(ctx)
  const ink = color('ink'), ink2 = color('ink2')
  const session = unit01(r.session ?? 0)
  const sheet = `SHEET ${pad(ctx.town.appFloors, 2)}`
  const gauge = 38, fill = gauge * session
  // With a project the page header already names the product, so the sheet names the project only.
  const header = r.project?.trim()
    ? mono(M, 24, 8, ink, `${fit(r.project.toUpperCase(), 22)} · ${sheet}`, { weight: 700, spacing: 1.8 })
    : mono(M, 24, 8, ink, 'DEVELOPER SIDECAR', { weight: 700, spacing: 1.8 })
      + mono(M, 35, 6.5, ink2, `PROJECT · ${sheet}`, { spacing: 1.4 })
  return `<g class="sk-frame sk-frame--back">`
    + header
    + sessionArc(ARC.c, ARC.r, session, { floor: ARC_FLOOR })
    + mono(M, 104, 7, ink, 'SESSION', { weight: 700, spacing: 1.6 })
    + mono(M, 114, 6.5, ink2, `${pad(Math.round(session * 100), 2)} %`, { spacing: 1.2 })
    + `<rect x="${M}" y="120" width="3" height="${gauge}" fill="${ink}"/>`
    + (fill > 0 ? `<rect x="${M}" y="${n(120 + gauge - fill)}" width="3" height="${n(fill)}" fill="${color('accent')}"/>` : '')
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
      [{ k: 'STEP', v: step, big: true }, { k: 'FILES', v: pad(r.files, 2) }, { k: 'TOKENS', v: fmtTokens(r.tokens) }],
      [{ k: 'NOW', v: r.now.trim() || '-' }, { k: 'ELAPSED', v: r.elapsed.trim() || '00:00' }])
    + statusStrip({ x: M, y: STRIP_Y }, VIEW.w - 2 * M, { text: caption ? `STEP ${step} · ${caption}` : `STEP ${step}`, live: r.live })
    + `</g>`
}
