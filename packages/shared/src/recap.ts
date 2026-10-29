import { z } from 'zod'
import { isRecord } from './hook-payload'
import { str } from './input'
import { makesChange, projectMap, type MapKind } from './project-map'
import { startsDevServer } from './shell'
import { checksOf, isStopped, type Attention, type FeedStep } from './step'
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

/**
 * Claude Code's tools for a command running in the background (it runs a dev server that way and polls it),
 * by their old and new names: reading its output, and stopping it.
 */
const BACKGROUND_TOOLS: { reads: ReadonlySet<string>; stops: ReadonlySet<string> } = {
  reads: new Set(['BashOutput', 'TaskOutput']),
  stops: new Set(['KillShell', 'KillBash', 'TaskStop']),
}

/** The background command a step names (`bash_id`, `shell_id`, `task_id`), or the one a run started. */
function shellOf(s: RecapStep): string | undefined {
  const named = isRecord(s.input) ? str(s.input.bash_id) || str(s.input.shell_id) || str(s.input.task_id) : ''
  if (named) return named
  if (isRecord(s.output) && str(s.output.backgroundTaskId)) return str(s.output.backgroundTaskId)
  const text = typeof s.output === 'string' ? s.output : isRecord(s.output) ? str(s.output.stdout) : ''
  return text.match(/running in background with ID: (\S+)/)?.[1]
}

/**
 * A dev server that is still up: the newest local address printed by a run step that finished well,
 * or by polling a background command. It is gone once a dev server command (or the command that
 * printed it) was cut short or failed, or its own background command was stopped. Another command
 * failing, such as `npm run build`, leaves it up.
 */
function serverUrl(steps: readonly RecapStep[]): string | undefined {
  let up: { url: string; command: string; shell?: string } | undefined
  for (const s of steps) {
    if (BACKGROUND_TOOLS.stops.has(s.toolName)) {
      if (up?.shell && shellOf(s) === up.shell) up = undefined
      continue
    }
    const run = s.category === 'run'
    const command = isRecord(s.input) ? str(s.input.command) : ''
    if (run && (s.status === 'failed' || isStopped(s))) {
      if (startsDevServer(command) || (command && command === up?.command)) up = undefined
      continue
    }
    if ((run || BACKGROUND_TOOLS.reads.has(s.toolName)) && s.status === 'ok') {
      const url = localUrl(s.output)
      const shell = shellOf(s)
      if (url) up = { url, command, ...(shell ? { shell } : {}) }
    }
  }
  return up?.url
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
    .flatMap((s) => s.items.filter((i) => i.state === 'changed' || i.state === 'failed').map((i) => ({ id: i.id, kind: s.kind, name: i.name, failed: i.state === 'failed' })))
  const packages = map.sections.find((s) => s.kind === 'blocks')?.items.filter((i) => i.state === 'changed' || i.state === 'failed').length ?? 0
  const byId = new Map(turnSteps.map((s) => [s.id, s]))
  const ran = checksOf(turnSteps) !== 'none'
  // a failed check run that no later run covered (see storyOf) is still failing
  const broken = last.beats.some((b) => {
    const s = b.type === 'step' && !b.fixedBy ? byId.get(b.id) : undefined
    return s?.category === 'test' && s.status === 'failed' && !isStopped(s)
  })
  const failing = last.outcome === 'failing'
    ? [...turnSteps].reverse().find((s) => s.status === 'failed' && s.category !== 'read' && !isStopped(s))
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
    // a turn that ran no checks reads the session's last ones, so the card and the status light agree
    checks: ran ? (broken ? 'fail' : 'pass') : checksOf(steps),
    fixes: last.fixes,
    ...(url ? { url } : {}),
    ...(failing ? { failingId: failing.id } : {}),
  }
}

/** The model's recap of a turn, after clipping: what happened, what it means, and the ask when something is still broken. */
export const AiRecapSchema = z.object({
  summary: z.string().min(1).max(600),
  meaning: z.string().min(1).max(400),
  next: z.string().min(1).max(200).optional(),
})
export type AiRecap = z.infer<typeof AiRecapSchema>

/**
 * pending: the model is writing it. done: it's in `ai`. unavailable: the call failed, recaps are
 * paused or no model was found yet (see `reason`); a done recap is only ever replaced by a newer done one. A turn that needed no call (recaps off, nothing changed) has no entry at all.
 */
export type RecapStatus = 'pending' | 'done' | 'unavailable'

/** One turn's AI recap as stored and sent to the workstation. */
export interface RecapEntry {
  sessionId: string
  /** The turn's prompt step id, or its first step's when the session began mid-turn. */
  turnId: string
  /** The newest step the recap covers: a later Stop with nothing new after it is not recapped again. */
  lastStepId: string
  at: number
  status: RecapStatus
  ai?: AiRecap
  reason?: string
}
