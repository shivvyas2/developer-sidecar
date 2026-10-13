import type { SidecarEvent, Step } from '@sidecar/shared'

export class StepTracker {
  private open = new Map<string, Step>()
  private fifo = new Map<string, string[]>()

  apply(e: SidecarEvent): Step | null {
    if (e.kind === 'prompt') {
      return { id: e.id, sessionId: e.sessionId, toolName: 'UserPrompt', input: { prompt: e.prompt ?? '' }, startedAt: e.ts, endedAt: e.ts, status: 'ok' }
    }
    if (!e.tool) return null
    const fifoKey = `${e.sessionId}|${e.tool.name}`

    if (e.kind === 'tool_start') {
      const step: Step = { id: e.tool.useId ?? e.id, sessionId: e.sessionId, toolName: e.tool.name, input: e.tool.input, startedAt: e.ts, status: 'running' }
      this.open.set(step.id, step)
      if (!e.tool.useId) this.fifo.set(fifoKey, [...(this.fifo.get(fifoKey) ?? []), step.id])
      return { ...step }
    }

    if (e.kind === 'tool_end') {
      let id = e.tool.useId && this.open.has(e.tool.useId) ? e.tool.useId : undefined
      if (!id && !e.tool.useId) {
        const queue = this.fifo.get(fifoKey) ?? []
        id = queue.shift()
        this.fifo.set(fifoKey, queue)
      }
      const started = id ? this.open.get(id) : undefined
      if (id) this.open.delete(id)
      const status = e.tool.ok === false ? 'failed' : 'ok'
      const base: Step = started ?? {
        id: e.tool.useId ?? e.id, sessionId: e.sessionId, toolName: e.tool.name, input: e.tool.input, startedAt: e.ts, status,
      }
      const done: Step = { ...base, endedAt: e.ts, status }
      if (e.tool.output !== undefined) done.output = e.tool.output
      return done
    }
    return null
  }

  sweep(now: number, maxAgeMs = 600_000): Step[] {
    return this.interrupt(now, (step) => now - step.startedAt > maxAgeMs)
  }

  /** Closes every step still open in a session, e.g. when its turn ends (a denied tool never gets an end event). */
  closeSession(sessionId: string, now: number): Step[] {
    return this.interrupt(now, (step) => step.sessionId === sessionId)
  }

  private interrupt(now: number, shouldClose: (step: Step) => boolean): Step[] {
    const out: Step[] = []
    for (const [id, step] of this.open) {
      if (shouldClose(step)) {
        this.open.delete(id)
        for (const [k, q] of this.fifo) this.fifo.set(k, q.filter((x) => x !== id))
        out.push({ ...step, status: 'interrupted', endedAt: now })
      }
    }
    return out
  }
}
