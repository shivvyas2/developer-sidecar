/**
 * What the mod polled, and what each Claude Code surface shows from it.
 * Pure: no engine, no Node, no DOM.
 */
import { isExplained, type ExplainerState, type FeedStep } from '@sidecar/shared'
import { formatElapsed, stepTitle, type Readout, type TextModel, type TextStep } from '@sidecar/ui-kit'

export interface ModState {
  /** Every step of this session, oldest first. */
  steps: FeedStep[]
  explainer: ExplainerState | null
  offline: boolean
  project: string
  port: number
}

/** The default port until the locate script answers (DEFAULT_PORT in @sidecar/shared/home, which the mod cannot import). */
const DEFAULT_PORT = 7377
/** How many of the newest steps the pane lays out. */
export const TEXT_STEPS = 50

export const emptyState = (): ModState => ({ steps: [], explainer: null, offline: false, project: '', port: DEFAULT_PORT })

const CONTROLS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g
/** One clean line: controls and bidi marks become spaces, whitespace collapses. */
export const plain = (s: unknown): string => String(s ?? '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()

export const pad3 = (n: number): string => String(Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0).padStart(3, '0')

export const basename = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? ''

const tokensOf = (s: ModState) => (s.explainer ? s.explainer.tokens.input + s.explainer.tokens.output : 0)
const filesOf = (steps: readonly FeedStep[]) => steps.filter((st) => st.category === 'create' && st.status === 'ok').length

export function readoutOf(s: ModState): Readout {
  const first = s.steps[0]
  const last = s.steps.at(-1)
  return {
    step: s.steps.length,
    files: filesOf(s.steps),
    tokens: tokensOf(s),
    now: last ? stepTitle(last) : '',
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
    readout: { step: r.step, files: r.files, tokens: r.tokens, elapsed: r.elapsed },
    steps: s.steps.slice(offset).map((st, i) => textStep(st, offset + i + 1)),
  }
}

const MARK: Record<FeedStep['status'], string> = { running: '●', ok: '✓', failed: '✕', interrupted: '◌' }

/** `◢ 042 INSTALL · STRIPE ●`, cut to `max` columns with the mark kept; undefined clears it. */
export function statusLine(s: ModState, max = 60): string | undefined {
  const last = s.steps.at(-1)
  if (s.offline || !last) return undefined
  const head = `◢ ${pad3(s.steps.length)} `
  const tail = ` ${MARK[last.status]}`
  const room = Math.max(1, max - [...head].length - [...tail].length)
  const title = [...plain(stepTitle(last)).toUpperCase()]
  const fitted = title.length <= room ? title.join('') : title.slice(0, room - 1).join('') + '…'
  return head + fitted + tail
}

/** The band's words: the latest plain explanation, else its caption. */
export function bandLine(s: ModState): string | undefined {
  const last = s.steps.at(-1)
  if (s.offline || !last) return undefined
  const e = isExplained(last.explanation) ? last.explanation : undefined
  return plain(e?.plain ?? last.caption) || undefined
}

/** Changes whenever anything a surface shows could change: a step, its status, its explanation, the token count. */
export function fingerprint(steps: readonly FeedStep[], explainer: ExplainerState | null): string {
  return JSON.stringify([
    steps.map((st) => [st.id, st.status, st.caption, st.explanation ? JSON.stringify(st.explanation) : '']),
    explainer ? [explainer.status, explainer.tokens.input, explainer.tokens.output] : null,
  ])
}

export const workstationUrl = (s: ModState): string => `http://localhost:${s.port}`
