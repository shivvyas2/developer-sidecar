import { vi } from 'vitest'
import { fromHookPayload, type FeedStep } from '@sidecar/shared'
import type { ModelTask, Provider } from '../../packages/server/src/explainer/providers'
import { createRecapper } from '../../packages/server/src/explainer/recap'
import { Hub } from '../../packages/server/src/hub'
import { createPipeline } from '../../packages/server/src/pipeline'
import { memorySettings } from '../../packages/server/src/settings'
import { openStore } from '../../packages/server/src/store'
import type { BenchSession } from './sessions'

/** A plausible recap of a turn, so output size can be estimated offline. */
export const CANNED_RECAP = {
  summary: 'Claude added a checkout page and a small server route that sends the shopper to a Stripe payment page, then brings them back to a thank-you page.',
  meaning: 'People can pay you now. Card numbers stay on Stripe’s servers, which keeps your app out of most security audits.',
  next: null,
  decisions: [{ step: 's1', title: 'Payments', choice: 'Stripe Checkout', alternatives: ['PayPal', 'Paddle'], reason: 'A hosted page means no card data touches the app.' }],
  concepts: [{ step: 's2', term: 'Checkout session', definition: 'A one-time Stripe payment page created for a single purchase.' }],
}

/** About four characters per token for English and code: good enough to compare runs, not to bill. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4)

export interface SessionRun {
  name: string
  steps: FeedStep[]
  /** Every model call the session made, in order. */
  requests: Array<ModelTask<unknown>>
}

/**
 * Plays a session's hook payloads through the real pipeline and recapper with a fake clock. The
 * provider records each request and answers with the canned recap; live calls, if wanted, replay
 * these requests afterwards.
 */
export async function runSession(s: BenchSession): Promise<SessionRun> {
  vi.useFakeTimers()
  try {
    let clock = 1_000_000
    const hub = new Hub()
    const store = openStore(':memory:')
    const requests: Array<ModelTask<unknown>> = []
    const provider: Provider = {
      id: 'api',
      async call(task) {
        requests.push(task as ModelTask<unknown>)
        return { output: task.schema.parse(CANNED_RECAP), usage: { input: 0, output: 0 } }
      },
    }
    const pipeline = createPipeline({ store, hub, now: () => clock })
    const rx = createRecapper({ hub, store, settings: memorySettings({ explanations: 'haiku' }), provider, now: () => clock, retryDelayMs: 0 })
    for (const [i, e] of s.events.entries()) {
      await vi.advanceTimersByTimeAsync(e.gapMs)
      clock += e.gapMs
      const event = fromHookPayload(e.payload, { now: clock, id: `${s.name}-${i}` })
      if (event) pipeline.ingest(event)
      await rx.idle()
    }
    await vi.runAllTimersAsync()
    await rx.idle()
    rx.stop()
    const steps = store.stepsForSession(String(s.events[0]?.payload.session_id))
    store.close()
    return { name: s.name, steps, requests }
  } finally {
    vi.useRealTimers()
  }
}

export interface Stats {
  /** Finished steps (ok or failed, not prompts). */
  finished: number
  /** Turns that ended (Stop). */
  turns: number
  calls: number
  requestChars: number
  estInputTokens: number
  estOutputTokens: number
}

export function statsOf(run: SessionRun, turns: number): Stats {
  const requestChars = run.requests.reduce((n, r) => n + r.system.length + r.user.length, 0)
  return {
    finished: run.steps.filter((s) => s.category !== 'prompt' && (s.status === 'ok' || s.status === 'failed')).length,
    turns,
    calls: run.requests.length,
    requestChars,
    estInputTokens: estimateTokens(requestChars),
    estOutputTokens: estimateTokens(JSON.stringify(CANNED_RECAP).length * run.requests.length),
  }
}

/** How many times Claude's turn ended in a session (its Stop hooks). */
export const turnsIn = (s: BenchSession) => s.events.filter((e) => e.payload.hook_event_name === 'Stop').length
