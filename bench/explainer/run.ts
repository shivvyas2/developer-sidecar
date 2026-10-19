import { vi } from 'vitest'
import { fromHookPayload, type FeedStep } from '@sidecar/shared'
import type { ExplainRequest } from '../../packages/server/src/explainer/prompt'
import type { Provider } from '../../packages/server/src/explainer/providers'
import { createExplainer, QUIET_MS } from '../../packages/server/src/explainer/service'
import { Hub } from '../../packages/server/src/hub'
import { createPipeline } from '../../packages/server/src/pipeline'
import { memorySettings } from '../../packages/server/src/settings'
import { openStore } from '../../packages/server/src/store'
import type { BenchSession } from './sessions'

/** A plausible answer per step, so output size can be estimated offline. */
const cannedItem = (stepId: string) => ({
  stepId,
  plain: 'Claude added a small file that sends the shopper to a Stripe payment page and comes back to your site afterwards.',
  why: 'Payments run on Stripe’s servers, so card numbers never touch your app, which keeps you out of most security audits.',
  concept: { term: 'Checkout session', definition: 'A one-time Stripe payment page created for a single purchase.' },
  decision: null,
  next: null,
})

export const idsIn = (req: ExplainRequest) => [...req.user.matchAll(/"stepId":"([^"]+)"/g)].map((m) => m[1]!)
/** About four characters per token for English and code: good enough to compare runs, not to bill. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4)

export interface SessionRun {
  name: string
  steps: FeedStep[]
  requests: ExplainRequest[]
  /** The real step ids in each request, in order (requests may number their steps instead). */
  batches: string[][]
  /** Step ids in the order they were sent, across all requests. */
  sent: string[]
}

/**
 * Plays a session's hook payloads through the real pipeline and explainer with a fake clock, so batching
 * matches what a live server does (3 s of quiet, at most 8 per batch). The provider records each request
 * and answers with canned text; live calls, if wanted, replay these requests afterwards.
 */
export async function runSession(s: BenchSession): Promise<SessionRun> {
  vi.useFakeTimers()
  try {
    let clock = 1_000_000
    const hub = new Hub()
    const store = openStore(':memory:')
    const requests: ExplainRequest[] = []
    // explanations are published per batch in request order, which recovers each request's real step ids
    const explained: string[] = []
    hub.subscribe((m) => { if (m.type === 'explanation') explained.push(m.stepId) })
    const provider: Provider = {
      id: 'api',
      async call(req) {
        requests.push(req)
        const output = { items: idsIn(req).map(cannedItem) }
        return { output: output as never, usage: { input: 0, output: 0 } }
      },
    }
    const pipeline = createPipeline({ store, hub, now: () => clock })
    const ex = createExplainer({ hub, store, settings: memorySettings({ explanations: 'haiku' }), provider, now: () => clock, retryDelayMs: 0 })
    for (const [i, e] of s.events.entries()) {
      await vi.advanceTimersByTimeAsync(e.gapMs)
      clock += e.gapMs
      const event = fromHookPayload(e.payload, { now: clock, id: `${s.name}-${i}` })
      if (event) pipeline.ingest(event)
    }
    await vi.advanceTimersByTimeAsync(QUIET_MS + 10)
    await ex.idle()
    ex.stop()
    const sessionId = String(s.events[0]?.payload.session_id)
    const steps = store.stepsForSession(sessionId)
    store.close()
    let at = 0
    const batches = requests.map((r) => explained.slice(at, (at += idsIn(r).length)))
    return { name: s.name, steps, requests, batches, sent: batches.flat() }
  } finally {
    vi.useRealTimers()
  }
}

export interface Stats {
  /** Finished steps the explainer could have explained (ok or failed, not prompts). */
  finished: number
  sent: number
  batches: number
  /** Just the step lines of every request: what trimming protects, without the prompt repeated per request. */
  stepChars: number
  requestChars: number
  estInputTokens: number
  estOutputTokens: number
}

export function statsOf(run: SessionRun): Stats {
  const requestChars = run.requests.reduce((n, r) => n + r.system.length + r.user.length, 0)
  const stepChars = run.requests.reduce((n, r) => n + r.user.split('\n').filter((l) => l.startsWith('{"stepId"')).reduce((m, l) => m + l.length, 0), 0)
  const outputChars = run.requests.reduce((n, r) => n + JSON.stringify({ items: idsIn(r).map(cannedItem) }).length, 0)
  return {
    finished: run.steps.filter((s) => s.category !== 'prompt' && (s.status === 'ok' || s.status === 'failed')).length,
    sent: run.sent.length,
    batches: run.requests.length,
    stepChars,
    requestChars,
    estInputTokens: estimateTokens(requestChars),
    estOutputTokens: estimateTokens(outputChars),
  }
}
