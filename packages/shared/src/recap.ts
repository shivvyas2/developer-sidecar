import { makesChange, projectMap, type MapKind } from './project-map'
import type { Attention, FeedStep } from './step'
import { storyOf, type ChapterOutcome, type StoryStep } from './story'

/**
 * "Where things stand" after the last thing you asked: what got built, whether the checks pass, where
 * to open the app and what Claude needs. Built from steps alone, with no model.
 */

/** A part made or changed. `id` is the map item's (`kind:key`): unique, where two parts can share a name. */
export interface RecapPart { id: string; kind: MapKind; name: string; failed: boolean }

export interface RuleRecap {
  /** The turn (story chapter) this recap is about: its prompt's id, or its first step's when there was no prompt. */
  turnId: string
  asked: string
  /** working: Claude is at it. done: its turn ended. you: it is waiting for your permission. */
  state: 'working' | 'done' | 'you'
  outcome: ChapterOutcome
  /** Parts made or changed in this turn, in map order. Packages are counted, not listed. */
  built: RecapPart[]
  packages: number
  /** A create, edit or install finished in this turn, including on files the map does not name (README.md). */
  changed: boolean
  checks: 'pass' | 'fail' | 'none'
  fixes: number
  /** The local address a dev server printed, if one is running. */
  url?: string
  /** The failed step still standing in the way, for a "what to do next" ask. */
  failingId?: string
}

export type RecapStep = StoryStep & Pick<FeedStep, 'output'>

const LOCAL_URL = /\b(https?):\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})(\/[\w\-./~%]*)?/

/**
 * The first local address in a step's output, with 0.0.0.0 and [::1] read as localhost. Other hosts never count.
 * The scheme is kept, since an https dev server does not answer http.
 */
export function localUrl(output: unknown): string | undefined {
  const text = typeof output === 'string' ? output : output === undefined ? '' : JSON.stringify(output)
  const m = text.match(LOCAL_URL)
  if (!m) return undefined
  const port = Number(m[2])
  if (port < 1 || port > 65535) return undefined
  const path = (m[3] ?? '').replace(/\.+$/, '')
  return `${m[1]}://localhost:${port}${path === '/' ? '' : path}`
}

/** Tools that read or stop a background command (Claude Code runs a dev server in the background and polls it). */
const READS_BACKGROUND = new Set(['BashOutput'])
const STOPS_BACKGROUND = new Set(['KillShell', 'KillBash'])

/**
 * A dev server that is still up: the newest local address printed by a run step that finished well,
 * or by polling a background command, unless a later run was cut short or failed, or a background
 * command was stopped.
 */
function serverUrl(steps: readonly RecapStep[]): string | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (STOPS_BACKGROUND.has(s.toolName)) return undefined
    const run = s.category === 'run'
    if (run && (s.status === 'interrupted' || s.status === 'failed')) return undefined
    if ((run || READS_BACKGROUND.has(s.toolName)) && s.status === 'ok') {
      const url = localUrl(s.output)
      if (url) return url
    }
  }
  return undefined
}

/**
 * The recap of the last thing you asked. `attention` is the session's; `cwd` its folder, for naming
 * parts from paths. Returns null for a session with no steps.
 */
export function buildRecap(steps: readonly RecapStep[], opts: { attention?: Attention; cwd?: string } = {}): RuleRecap | null {
  const chapters = storyOf(steps, opts.attention === 'working')
  const last = chapters.at(-1)
  if (!last) return null
  const turn = new Set(last.stepIds)
  const turnSteps = steps.filter((s) => turn.has(s.id))
  const map = projectMap(turnSteps, opts.cwd)
  const built = map.sections
    .filter((s) => s.kind !== 'blocks')
    .flatMap((s) => s.items.filter((i) => i.state !== 'seen').map((i) => ({ id: i.id, kind: s.kind, name: i.name, failed: i.state === 'failed' })))
  const packages = map.sections.find((s) => s.kind === 'blocks')?.items.filter((i) => i.state !== 'seen').length ?? 0
  const byId = new Map(turnSteps.map((s) => [s.id, s]))
  const ran = turnSteps.some((s) => s.category === 'test' && (s.status === 'ok' || s.status === 'failed'))
  // a failed check run that no later run covered (see storyOf) is still failing
  const broken = last.beats.some((b) => b.type === 'step' && !b.fixedBy && byId.get(b.id)?.category === 'test' && byId.get(b.id)?.status === 'failed')
  const failing = last.outcome === 'failing'
    ? [...turnSteps].reverse().find((s) => s.status === 'failed' && s.category !== 'read')
    : undefined
  const url = serverUrl(steps)
  return {
    turnId: last.id,
    asked: last.asked,
    state: opts.attention === 'permission' ? 'you' : opts.attention === 'working' ? 'working' : 'done',
    outcome: last.outcome,
    built,
    packages,
    changed: turnSteps.some((s) => s.status === 'ok' && makesChange(s)),
    checks: ran ? (broken ? 'fail' : 'pass') : 'none',
    fixes: last.fixes,
    ...(url ? { url } : {}),
    ...(failing ? { failingId: failing.id } : {}),
  }
}
