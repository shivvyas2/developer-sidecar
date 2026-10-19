/**
 * What the mod polled, and what each Claude Code surface shows from it.
 * Pure: no engine, no Node, no DOM.
 */
import { isExplained, type Attention, type ExplainerState, type FeedStep } from '@sidecar/shared'
import { checksOf, formatElapsed, HEALTH_LIGHT, HEALTH_WORD, healthOf, stepKind, stepTitle, type Readout, type TextModel, type TextStep } from '@sidecar/ui-kit'

export interface ModState {
  /** Every step of this session, oldest first. */
  steps: FeedStep[]
  explainer: ExplainerState | null
  /** What the session waits on, from the steps poll; unknown until the server says. */
  attention?: Attention
  offline: boolean
  project: string
  port: number
}

/** The default port until the locate script answers (DEFAULT_PORT in @sidecar/shared/home, which the mod cannot import). */
const DEFAULT_PORT = 7377
/** How many of the newest steps the pane lays out. */
export const TEXT_STEPS = 50

export const emptyState = (): ModState => ({ steps: [], explainer: null, offline: false, project: '', port: DEFAULT_PORT })

// eslint-disable-next-line no-control-regex -- this pattern exists to find and strip terminal control characters
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g
/** One clean line: controls and bidi marks become spaces, whitespace collapses. */
export const plain = (s: unknown): string => String(s ?? '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()

export const pad3 = (n: number): string => String(Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0).padStart(3, '0')

export const basename = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? ''

const tokensOf = (s: ModState) => (s.explainer ? s.explainer.tokens.input + s.explainer.tokens.output : 0)
const filesOf = (steps: readonly FeedStep[]) => steps.filter((st) => st.category === 'create' && st.status === 'ok').length

export function readoutOf(s: ModState): Readout {
  const first = s.steps[0]
  const last = s.steps.at(-1)
  const health = healthOf(s.steps, s.attention)
  return {
    step: s.steps.length,
    files: filesOf(s.steps),
    checks: checksOf(s.steps),
    status: HEALTH_WORD[health],
    light: HEALTH_LIGHT[health],
    now: last ? stepKind(last) : '',
    elapsed: first && last ? formatElapsed(last.startedAt - first.startedAt) : '00:00',
    live: !s.offline,
    session: s.steps.length > 0 ? 1 : 0,
    ...(s.project ? { project: s.project } : {}),
  }
}

function textStep(st: FeedStep, num: number): TextStep {
  const e = isExplained(st.explanation) ? st.explanation : undefined
  return {
    num, title: stepTitle(st), caption: st.caption, status: st.status,
    ...(e ? { plain: e.plain, why: e.why } : {}),
    ...(e?.concept ? { chip: e.concept.term } : {}),
  }
}

export function textModel(s: ModState): TextModel {
  const r = readoutOf(s)
  const offset = Math.max(0, s.steps.length - TEXT_STEPS)
  return {
    project: s.project,
    live: !s.offline,
    ...(s.offline ? { offline: true } : {}),
    readout: { step: r.step, files: r.files, tokens: tokensOf(s), elapsed: r.elapsed },
    steps: s.steps.slice(offset).map((st, i) => textStep(st, offset + i + 1)),
  }
}

const WIDE: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf],
  [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
]
const charWidth = (ch: string): number => {
  const cp = ch.codePointAt(0) ?? 0
  return WIDE.some(([a, b]) => cp >= a && cp <= b) ? 2 : 1
}
/** Display columns: East Asian wide, fullwidth and common emoji count as two. */
export const width = (s: string): number => [...s].reduce((n, ch) => n + charWidth(ch), 0)

const MARK: Record<FeedStep['status'], string> = { running: '●', ok: '✓', failed: '✕', interrupted: '◌' }

/** `◢ 042 INSTALL · STRIPE ●`, cut to `max` columns with the mark kept; undefined clears it. */
export function statusLine(s: ModState, max = 60): string | undefined {
  const last = s.steps.at(-1)
  if (s.offline || !last) return undefined
  const head = `◢ ${pad3(s.steps.length)} `
  const tail = ` ${MARK[last.status]}`
  const room = Math.max(1, max - width(head) - width(tail))
  const title = plain(stepTitle(last)).toUpperCase()
  if (width(title) <= room) return head + title + tail
  let fitted = ''
  for (const ch of title) {
    if (width(fitted) + charWidth(ch) + 1 > room) break
    fitted += ch
  }
  return head + fitted + '…' + tail
}

/** The band's words: the latest plain explanation, else its caption. */
export function bandLine(s: ModState): string | undefined {
  const last = s.steps.at(-1)
  if (s.offline || !last) return undefined
  const e = isExplained(last.explanation) ? last.explanation : undefined
  return plain(e?.plain ?? last.caption) || undefined
}

/** Changes whenever a step, its status, caption or explanation changes. */
export const stepsPrint = (steps: readonly FeedStep[]): string =>
  JSON.stringify(steps.map((st) => [st.id, st.status, st.caption, st.explanation ? JSON.stringify(st.explanation) : '']))

export const explainerPrint = (e: ExplainerState | null): string =>
  e ? `${e.status}|${e.tokens.input}|${e.tokens.output}` : ''

export const workstationUrl = (s: ModState): string => `http://localhost:${s.port}`
