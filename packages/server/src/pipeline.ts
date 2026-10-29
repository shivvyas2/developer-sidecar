import { ellipsis, scrubEvent, type Attention, type SidecarEvent, type Step } from '@sidecar/shared'
import type { Hub } from './hub'
import { translate } from './rules'
import { StepTracker } from './steps'
import type { Store } from './store'

export interface Pipeline {
  ingest(e: SidecarEvent): { seq: number | null }
  sweep(): number
  lastActivity(): number
}

const ATTENTION_TEXT = 200

/**
 * What an event says about whether Claude needs its person. Notices carry Claude Code's notification_type;
 * older Claude Code versions send only the message, so fall back to its wording.
 */
export function attentionOf(e: SidecarEvent): { state: Attention; text?: string } | undefined {
  if (e.kind === 'turn_end') return { state: 'done' }
  if (e.kind !== 'notice') return e.kind === 'session_start' ? undefined : { state: 'working' }
  const raw = (e.raw ?? {}) as { message?: unknown; notification_type?: unknown }
  const message = typeof raw.message === 'string' ? raw.message.replace(/\s+/g, ' ').trim() : ''
  const type = typeof raw.notification_type === 'string' ? raw.notification_type : ''
  const state: Attention | undefined =
    type === 'permission_prompt' || (!type && /permission/i.test(message)) ? 'permission'
      : type === 'idle_prompt' || (!type && /waiting for your input/i.test(message)) ? 'idle'
        : undefined
  if (!state) return undefined
  const text = ellipsis(message, ATTENTION_TEXT)
  return text ? { state, text } : { state }
}

export function createPipeline(o: { store: Store; tracker?: StepTracker; hub: Hub; now?: () => number }): Pipeline {
  const tracker = o.tracker ?? new StepTracker()
  const now = o.now ?? Date.now
  let last = now()

  const publishStep = (step: Step, seq: number) => {
    const feedStep = { ...step, ...translate(step), seq }
    o.store.saveStep(feedStep)
    o.hub.publish({ type: 'step', step: feedStep })
  }

  const publishInterrupted = (steps: Step[]) => {
    for (const step of steps) {
      const seq = o.store.insertEvent({
        id: `interrupted:${step.id}`, sessionId: step.sessionId, ts: now(), cwd: '', kind: 'notice', raw: { interrupted: step.id },
      })
      if (seq !== null) publishStep(step, seq)
    }
  }

  return {
    ingest(raw) {
      last = now()
      const e = scrubEvent(raw)
      const seq = o.store.insertEvent(e)
      if (seq === null) return { seq: null }
      o.hub.publish({ type: 'session', session: o.store.touchSession(e.sessionId, e.cwd, e.ts, attentionOf(e)) })
      if (e.kind === 'turn_end' || e.kind === 'prompt') publishInterrupted(tracker.closeSession(e.sessionId, e.ts))
      const step = tracker.apply(e)
      if (step) publishStep(step, seq)
      // after the open steps are closed, so whoever hears this sees the finished turn in the store
      if (e.kind === 'turn_end') {
        // Stop and the next UserPromptSubmit come from separate hook processes, so a prompt you queued can be
        // stored first: the turn that ended is the one holding the newest step that started before the Stop
        const lastStepId = o.store.stepsForSession(e.sessionId).filter((s) => s.startedAt <= e.ts).at(-1)?.id
        o.hub.publish({ type: 'turn_end', sessionId: e.sessionId, at: e.ts, ...(lastStepId ? { lastStepId } : {}) })
      }
      return { seq }
    },
    sweep() {
      const swept = tracker.sweep(now())
      publishInterrupted(swept)
      return swept.length
    },
    lastActivity: () => last,
  }
}
