import { basename } from 'node:path'
import type { ExplainerState, FeedStep, ServerMessage, StepExplanation } from '@sidecar/shared'
import type { Hub } from '../hub'
import type { SettingsStore } from '../settings'
import type { Store } from '../store'
import { buildRequest, normalize, toInput } from './prompt'
import { ExplainError, type ModelLevel, type Provider, type ProviderResult } from './providers'

export const QUIET_MS = 3000
export const MAX_BATCH = 8
export const RETRY_DELAY_MS = 1000
export const PAUSE_AFTER = 3
export const UNAVAILABLE_REASON = 'Set ANTHROPIC_API_KEY or install Claude Code (the claude command) to get explanations.'
const MISSING = 'No explanation was returned for this step.'

export interface Explainer {
  state(): ExplainerState
  settingsChanged(): void
  /** Swaps the provider (late detection): clears any pause and failure count and publishes state. */
  setProvider(p: Provider | null): void
  idle(): Promise<void>
  stop(): void
}

export interface ExplainerOptions {
  hub: Hub
  store: Store
  settings: SettingsStore
  provider: Provider | null
  now?: () => number
  quietMs?: number
  maxBatch?: number
  retryDelayMs?: number
  pauseAfter?: number
  /** When set, explanations are switched off from outside (e.g. an env var) and nothing is ever queued. */
  disabledReason?: string
  /** Receives unexpected errors from a batch (e.g. a store write failing). */
  log?: (msg: string) => void
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createExplainer(o: ExplainerOptions): Explainer {
  const now = o.now ?? Date.now
  const quietMs = o.quietMs ?? QUIET_MS
  const maxBatch = o.maxBatch ?? MAX_BATCH
  const retryDelayMs = o.retryDelayMs ?? RETRY_DELAY_MS
  const pauseAfter = o.pauseAfter ?? PAUSE_AFTER

  const queues = new Map<string, Map<string, FeedStep>>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let chain: Promise<void> = Promise.resolve()
  let current = o.provider
  let failures = 0
  let paused: string | null = null
  let epoch = 0 // bumped on reset
  const sessionEpochs = new Map<string, number>() // bumped on session_deleted
  const inFlight = new Set<string>() // step ids flushed but not finished
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

  const drop = (sessionId?: string) => {
    for (const id of sessionId ? [sessionId] : [...queues.keys()]) {
      clearTimeout(timers.get(id))
      timers.delete(id)
      queues.delete(id)
    }
  }

  const mark = (sessionId: string, stepId: string, explanation: StepExplanation) => {
    o.store.saveExplanation(sessionId, stepId, explanation, now())
    o.hub.publish({ type: 'explanation', sessionId, stepId, explanation })
  }

  async function runBatch(sessionId: string, steps: FeedStep[], lvl: ModelLevel, at: { epoch: number; session: number }): Promise<void> {
    const provider = current
    const stale = () => at.epoch !== epoch || at.session !== (sessionEpochs.get(sessionId) ?? 0)
    const finish = () => { for (const s of steps) inFlight.delete(s.id) }
    // switched off, stopped, reset or session deleted since this batch was queued: no call, no writes
    const cancelled = () => stopped || level() === 'off' || stale()
    try {
      if (!provider || cancelled()) return
      if (paused) {
        for (const s of steps) mark(sessionId, s.id, { unavailable: paused })
        return
      }
      const session = o.store.getSession(sessionId)
      const req = buildRequest(
        { project: session?.cwd ? basename(session.cwd) : 'this project', lastPrompt: o.store.lastPrompt(sessionId) },
        steps.map(toInput),
      )
      let result: ProviderResult | null = null
      let error: ExplainError | null = null
      for (let attempt = 0; attempt < 2 && !result; attempt++) {
        if (attempt > 0 && cancelled()) break
        try {
          result = await provider.explain(req, lvl)
        } catch (err) {
          error = err instanceof ExplainError ? err : new ExplainError(String(err), true)
          // a failed attempt can still have spent tokens
          if (error.usage) o.store.addUsage(error.usage)
          if (!error.retryable) break
          if (attempt === 0) await sleep(retryDelayMs)
        }
      }
      if (result) {
        // the tokens were spent even if the batch is dropped below
        o.store.addUsage(result.usage)
        failures = 0
      }
      if (cancelled()) { // reset, session deleted, stopped or level switched off mid-flight
        if (!stopped) publishState()
        return
      }
      settle(sessionId, steps, result, error)
      publishState()
    } finally {
      finish()
    }
  }

  function settle(sessionId: string, steps: FeedStep[], result: ProviderResult | null, error: ExplainError | null): void {
    if (result) {
      const explained = normalize(result.output, steps.map((s) => s.id))
      for (const s of steps) {
        const e = explained.get(s.id)
        if (!e) { mark(sessionId, s.id, { unavailable: MISSING }); continue }
        mark(sessionId, s.id, e)
        const at = now()
        if (e.decision) {
          const decision = { ...e.decision, id: `${s.id}:decision`, sessionId, stepId: s.id, at }
          o.store.addDecision(decision)
          o.hub.publish({ type: 'decision', decision })
        }
        if (e.concept) {
          const concept = { ...e.concept, sessionId, stepId: s.id, at }
          if (o.store.addConcept(concept)) o.hub.publish({ type: 'concept', concept })
        }
      }
    } else {
      const reason = error?.message ?? 'Explanation failed.'
      for (const s of steps) mark(sessionId, s.id, { unavailable: reason })
      failures++
      if (failures >= pauseAfter || (error && !error.retryable)) paused = reason
    }
  }

  const flush = (sessionId: string) => {
    clearTimeout(timers.get(sessionId))
    timers.delete(sessionId)
    const q = queues.get(sessionId)
    if (!q || q.size === 0) return
    const lvl = level()
    if (lvl === 'off') { queues.delete(sessionId); return }
    const all = [...q.values()]
    queues.delete(sessionId)
    const at = { epoch, session: sessionEpochs.get(sessionId) ?? 0 }
    for (const s of all) inFlight.add(s.id)
    for (let i = 0; i < all.length; i += maxBatch) {
      const batch = all.slice(i, i + maxBatch)
      chain = chain.then(() => runBatch(sessionId, batch, lvl, at)).catch((err: unknown) => {
        o.log?.(`explainer batch failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    }
  }

  const enqueue = (step: FeedStep) => {
    if (step.status !== 'ok' && step.status !== 'failed') return
    if (step.category === 'prompt') return
    if (level() === 'off' || !current || paused) return
    if (inFlight.has(step.id) || o.store.hasExplanation(step.id)) return
    const q = queues.get(step.sessionId) ?? new Map<string, FeedStep>()
    q.set(step.id, step)
    queues.set(step.sessionId, q)
    if (q.size >= maxBatch) return flush(step.sessionId)
    clearTimeout(timers.get(step.sessionId))
    timers.set(step.sessionId, setTimeout(() => flush(step.sessionId), quietMs))
  }

  const unsubscribe = o.hub.subscribe((m: ServerMessage) => {
    if (m.type === 'step') enqueue(m.step)
    else if (m.type === 'session_deleted') { sessionEpochs.set(m.id, (sessionEpochs.get(m.id) ?? 0) + 1); drop(m.id) }
    else if (m.type === 'reset') { epoch++; drop() }
  })

  return {
    state,
    settingsChanged() {
      paused = null
      failures = 0
      if (level() === 'off') drop()
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
      drop()
    },
  }
}
