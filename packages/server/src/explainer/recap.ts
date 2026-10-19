import { basename } from 'node:path'
import { buildRecap, storyOf, type ExplainerState, type RecapEntry, type ServerMessage } from '@sidecar/shared'
import type { Hub } from '../hub'
import type { SettingsStore } from '../settings'
import type { Store } from '../store'
import { ExplainError, type ModelLevel, type Provider, type ProviderResult } from './providers'
import { encodeTurn, normalizeRecap, RECAP_SHAPE, RECAP_SYSTEM_PROMPT, RecapOutputSchema, type RecapOutput } from './recap-prompt'

/** The most a recap may write: a few sentences, two decisions and three terms fit well inside it. */
export const RECAP_MAX_TOKENS = 1000
/** A turn is recapped at most this often, however many times Claude Code's Stop hook fires on it. */
export const MAX_RECAPS_PER_TURN = 2
export const RETRY_DELAY_MS = 1000
export const PAUSE_AFTER = 3
export const UNAVAILABLE_REASON = 'Set ANTHROPIC_API_KEY or install Claude Code (the claude command) to get AI recaps.'
const EMPTY = 'The recap came back empty.'
const TURNED_OFF = 'AI recaps were turned off.'

export interface Explainer {
  state(): ExplainerState
  settingsChanged(): void
  /** Swaps the provider (late detection): clears any pause and failure count and publishes state. */
  setProvider(p: Provider | null): void
  idle(): Promise<void>
  stop(): void
}

export interface RecapperOptions {
  hub: Hub
  store: Store
  settings: SettingsStore
  provider: Provider | null
  now?: () => number
  retryDelayMs?: number
  pauseAfter?: number
  /** When set, recaps are switched off from outside (e.g. an env var) and no call is ever made. */
  disabledReason?: string
  /** Receives unexpected errors from a recap (e.g. a store write failing). */
  log?: (msg: string) => void
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * One AI recap per Claude turn, when the turn ends (the Stop hook), instead of an explanation per
 * step. Calls run one at a time across sessions; a turn waits in line at most once, and its recap
 * reads the turn as it stands when it runs, even if a new turn has started since. No call is made when recaps are off, paused or unavailable,
 * when the turn changed nothing, or when the turn was already recapped up to its newest step.
 */
export function createRecapper(o: RecapperOptions): Explainer {
  const now = o.now ?? Date.now
  const retryDelayMs = o.retryDelayMs ?? RETRY_DELAY_MS
  const pauseAfter = o.pauseAfter ?? PAUSE_AFTER

  let chain: Promise<void> = Promise.resolve()
  let current = o.provider
  let failures = 0
  let paused: string | null = null
  let epoch = 0 // bumped on reset
  const sessionEpochs = new Map<string, number>() // bumped on session_deleted
  const waiting = new Set<string>() // turns in line, not yet started (see key)
  let stopped = false

  const level = () => (o.disabledReason ? 'off' : o.settings.get().explanations)

  const state = (): ExplainerState => {
    const base = { level: level(), provider: current?.id ?? null, tokens: o.store.usage() }
    if (o.disabledReason) return { ...base, status: 'off', reason: o.disabledReason }
    if (base.level === 'off') return { ...base, status: 'off' }
    if (!current) return { ...base, status: 'unavailable', reason: UNAVAILABLE_REASON }
    if (paused) return { ...base, status: 'paused', reason: paused }
    return { ...base, status: 'ready' }
  }
  const publishState = () => o.hub.publish({ type: 'explainer', state: state() })

  const save = (r: RecapEntry) => {
    o.store.saveRecap(r)
    o.hub.publish({ type: 'recap', recap: r })
  }

  async function run(sessionId: string, turnId: string, at: { epoch: number; session: number }): Promise<void> {
    waiting.delete(key(sessionId, turnId))
    const stale = () => at.epoch !== epoch || at.session !== (sessionEpochs.get(sessionId) ?? 0)
    const lvl = level()
    const provider = current
    if (stopped || stale() || lvl === 'off' || !provider) return

    const all = o.store.stepsForSession(sessionId)
    const turn = storyOf(all).find((c) => c.id === turnId)
    if (!turn) return
    const ids = new Set(turn.stepIds)
    const turnSteps = all.filter((s) => ids.has(s.id))
    // a turn of only reading (or nothing) has nothing worth a call
    if (!turnSteps.some((s) => (s.status === 'ok' || s.status === 'failed') && s.category !== 'read')) return
    const lastStepId = turnSteps.at(-1)!.id
    // the session up to this turn's end, so the rule recap is about this turn and not a newer one
    const steps = all.slice(0, all.findIndex((s) => s.id === lastStepId) + 1)
    const existing = o.store.getRecap(turn.id)
    if (existing && (existing.lastStepId === lastStepId || existing.count >= MAX_RECAPS_PER_TURN)) return

    const entry = { sessionId, turnId: turn.id, lastStepId }
    if (paused) { save({ ...entry, at: now(), status: 'unavailable', reason: paused }); return }

    const session = o.store.getSession(sessionId)
    const cwd = session?.cwd || undefined
    const rule = buildRecap(steps, { attention: 'done', ...(cwd ? { cwd } : {}) })!
    const { user, labels } = encodeTurn({ project: cwd ? basename(cwd) : 'this project', asked: turn.asked, rule, ...(cwd ? { cwd } : {}) }, turnSteps)
    const task = { system: RECAP_SYSTEM_PROMPT, user, schema: RecapOutputSchema, maxTokens: RECAP_MAX_TOKENS, shape: RECAP_SHAPE }
    save({ ...entry, at: now(), status: 'pending' })

    // switched off, stopped, reset or session deleted since this recap was queued: no more calls or writes
    const cancelled = () => stopped || level() === 'off' || stale()
    let result: ProviderResult<RecapOutput> | null = null
    let error: ExplainError | null = null
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      if (attempt > 0 && cancelled()) break
      try {
        result = await provider.call(task, lvl as ModelLevel)
      } catch (err) {
        error = err instanceof ExplainError ? err : new ExplainError(String(err), true)
        // a failed attempt can still have spent tokens
        if (error.usage) o.store.addUsage(error.usage)
        if (!error.retryable) break
        if (attempt === 0) await sleep(retryDelayMs)
      }
    }
    // the tokens were spent even if the recap is dropped below
    if (result) o.store.addUsage(result.usage)
    if (stopped || stale()) return
    if (level() === 'off') { save({ ...entry, at: now(), status: 'unavailable', reason: TURNED_OFF }); publishState(); return }

    const recap = result ? normalizeRecap(result.output, labels, rule.outcome === 'failing') : null
    if (recap) {
      failures = 0
      save({ ...entry, at: now(), status: 'done', ai: recap.ai })
      const t = now()
      for (const [i, d] of recap.decisions.entries()) {
        // a recap may cite one step for two decisions
        const decision = { ...d, id: `${d.stepId}:decision:${i}`, sessionId, at: t }
        o.store.addDecision(decision)
        o.hub.publish({ type: 'decision', decision })
      }
      for (const c of recap.concepts) {
        const concept = { ...c, sessionId, at: t }
        if (o.store.addConcept(concept)) o.hub.publish({ type: 'concept', concept })
      }
    } else {
      const reason = error?.message ?? EMPTY
      save({ ...entry, at: now(), status: 'unavailable', reason })
      failures++
      if (failures >= pauseAfter || (error && !error.retryable)) paused = reason
    }
    publishState()
  }

  const key = (sessionId: string, turnId: string) => `${sessionId}\n${turnId}`
  /** Queues the turn that just ended: which turn is read now, since a new one may start before the call. */
  const schedule = (sessionId: string) => {
    if (stopped) return
    const turnId = storyOf(o.store.stepsForSession(sessionId)).at(-1)?.id
    if (!turnId || waiting.has(key(sessionId, turnId))) return
    waiting.add(key(sessionId, turnId))
    const at = { epoch, session: sessionEpochs.get(sessionId) ?? 0 }
    chain = chain.then(() => run(sessionId, turnId, at)).catch((err: unknown) => {
      o.log?.(`recap failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  }

  const unsubscribe = o.hub.subscribe((m: ServerMessage) => {
    if (m.type === 'turn_end') schedule(m.sessionId)
    else if (m.type === 'session_deleted') {
      sessionEpochs.set(m.id, (sessionEpochs.get(m.id) ?? 0) + 1)
      for (const k of waiting) if (k.startsWith(`${m.id}\n`)) waiting.delete(k)
    }
    else if (m.type === 'reset') { epoch++; waiting.clear() }
  })

  return {
    state,
    settingsChanged() {
      paused = null
      failures = 0
      publishState()
    },
    setProvider(p) {
      current = p
      paused = null
      failures = 0
      publishState()
    },
    idle: () => chain,
    stop() {
      stopped = true
      unsubscribe()
      waiting.clear()
    },
  }
}
