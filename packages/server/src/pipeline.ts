import { scrubEvent, type SidecarEvent, type Step } from '@sidecar/shared'
import type { Hub } from './hub'
import { translate } from './rules'
import { StepTracker } from './steps'
import type { Store } from './store'

export interface Pipeline {
  ingest(e: SidecarEvent): { seq: number | null }
  sweep(): number
  lastActivity(): number
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

  return {
    ingest(raw) {
      last = now()
      const e = scrubEvent(raw)
      const seq = o.store.insertEvent(e)
      if (seq === null) return { seq: null }
      o.hub.publish({ type: 'session', session: o.store.touchSession(e.sessionId, e.cwd, e.ts) })
      const step = tracker.apply(e)
      if (step) publishStep(step, seq)
      return { seq }
    },
    sweep() {
      const swept = tracker.sweep(now())
      for (const step of swept) {
        const seq = o.store.insertEvent({
          id: `interrupted:${step.id}`, sessionId: step.sessionId, ts: now(), cwd: '', kind: 'notice', raw: { interrupted: step.id },
        })
        if (seq !== null) publishStep(step, seq)
      }
      return swept.length
    },
    lastActivity: () => last,
  }
}
