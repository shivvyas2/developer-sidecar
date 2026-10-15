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
  let failures = 0
  let paused: string | null = null

  const level = () => o.settings.get().explanations

  const state = (): ExplainerState => {
    const base = { level: level(), provider: o.provider?.id ?? null, tokens: o.store.usage() }
    if (base.level === 'off') return { ...base, status: 'off' }
    if (!o.provider) return { ...base, status: 'unavailable', reason: UNAVAILABLE_REASON }
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

  async function runBatch(sessionId: string, steps: FeedStep[], lvl: ModelLevel): Promise<void> {
    const provider = o.provider
    if (!provider || paused) return
    const session = o.store.getSession(sessionId)
    const req = buildRequest(
      { project: session?.cwd ? basename(session.cwd) : 'this project', lastPrompt: o.store.lastPrompt(sessionId) },
      steps.map(toInput),
    )
    let result: ProviderResult | null = null
    let error: ExplainError | null = null
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try {
        result = await provider.explain(req, lvl)
      } catch (err) {
        error = err instanceof ExplainError ? err : new ExplainError(String(err), true)
        if (!error.retryable) break
        if (attempt === 0) await sleep(retryDelayMs)
      }
    }
    if (!queuesAllowed(sessionId)) return // session deleted or level switched off mid-flight

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
      o.store.addUsage(result.usage)
      failures = 0
    } else {
      const reason = error?.message ?? 'Explanation failed.'
      for (const s of steps) mark(sessionId, s.id, { unavailable: reason })
      failures++
      if (failures >= pauseAfter || (error && !error.retryable)) paused = reason
    }
    publishState()
  }

  const deleted = new Set<string>()
  const queuesAllowed = (sessionId: string) => level() !== 'off' && !deleted.has(sessionId)

  const flush = (sessionId: string) => {
    clearTimeout(timers.get(sessionId))
    timers.delete(sessionId)
    const q = queues.get(sessionId)
    if (!q || q.size === 0) return
    const lvl = level()
    if (lvl === 'off') { queues.delete(sessionId); return }
    const all = [...q.values()]
    queues.delete(sessionId)
    for (let i = 0; i < all.length; i += maxBatch) {
      const batch = all.slice(i, i + maxBatch)
      chain = chain.then(() => runBatch(sessionId, batch, lvl)).catch(() => undefined)
    }
  }

  const enqueue = (step: FeedStep) => {
    if (step.status !== 'ok' && step.status !== 'failed') return
    if (step.category === 'prompt') return
    if (level() === 'off' || !o.provider || paused) return
    if (o.store.hasExplanation(step.id)) return
    deleted.delete(step.sessionId)
    const q = queues.get(step.sessionId) ?? new Map<string, FeedStep>()
    q.set(step.id, step)
    queues.set(step.sessionId, q)
    if (q.size >= maxBatch) return flush(step.sessionId)
    clearTimeout(timers.get(step.sessionId))
    timers.set(step.sessionId, setTimeout(() => flush(step.sessionId), quietMs))
  }

  const unsubscribe = o.hub.subscribe((m: ServerMessage) => {
    if (m.type === 'step') enqueue(m.step)
    else if (m.type === 'session_deleted') { deleted.add(m.id); drop(m.id) }
    else if (m.type === 'reset') { for (const id of queues.keys()) deleted.add(id); drop() }
  })

  return {
    state,
    settingsChanged() {
      paused = null
      failures = 0
      if (level() === 'off') drop()
      publishState()
    },
    idle: () => chain,
    stop() {
      unsubscribe()
      drop()
    },
  }
}
