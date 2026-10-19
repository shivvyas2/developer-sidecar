import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FeedStep, RecapEntry, ServerMessage, Step } from '@sidecar/shared'
import { Hub } from '../src/hub'
import { ExplainError, type ModelTask, type Provider } from '../src/explainer/providers'
import { MAX_RECAPS_PER_TURN, RECAP_MAX_TOKENS, createRecapper } from '../src/explainer/recap'
import { translate } from '../src/rules'
import { memorySettings } from '../src/settings'
import { openStore } from '../src/store'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const ANSWER = {
  summary: 'Claude added a checkout page.', meaning: 'People can pay you now.', next: 'Fix the failing checkout test',
  decisions: [{ step: 's1', title: 'Payments', choice: 'Stripe', alternatives: ['PayPal'], reason: 'Hosted checkout' }],
  concepts: [{ step: 's1', term: 'Checkout session', definition: 'A one-time payment page.' }],
}

/** Answers like a real provider: validated against the task's schema, with usage. */
function fake(answer: (task: ModelTask<unknown>) => unknown = () => ANSWER) {
  const tasks: Array<ModelTask<unknown>> = []
  let inFlight = 0, most = 0
  const provider: Provider = {
    id: 'api',
    async call(task) {
      tasks.push(task as ModelTask<unknown>)
      inFlight++; most = Math.max(most, inFlight)
      try {
        await Promise.resolve()
        return { output: task.schema.parse(await answer(task as ModelTask<unknown>)), usage: { input: 100, output: 40 } }
      } finally { inFlight-- }
    },
  }
  return { provider, tasks, most: () => most }
}

let seq = 0
function setup(provider: Provider | null, opts: { level?: 'off' | 'haiku' | 'sonnet'; disabledReason?: string; pauseAfter?: number } = {}) {
  const hub = new Hub()
  const store = openStore(':memory:')
  const got: ServerMessage[] = []
  hub.subscribe((m) => got.push(m))
  const settings = memorySettings({ explanations: opts.level ?? 'haiku' })
  const rx = createRecapper({ hub, store, settings, provider, retryDelayMs: 0, ...(opts.disabledReason ? { disabledReason: opts.disabledReason } : {}), ...(opts.pauseAfter ? { pauseAfter: opts.pauseAfter } : {}) })
  const add = (sessionId: string, toolName: string, input: Record<string, unknown>, status: Step['status'] = 'ok', output?: unknown) => {
    const s: Step = { id: `st${++seq}`, sessionId, toolName, input, startedAt: seq, status, ...(output !== undefined ? { output } : {}) }
    const step: FeedStep = { ...s, ...translate(s), seq }
    store.touchSession(sessionId, '/work/shop', seq)
    store.saveStep(step)
    return step
  }
  const turn = (sessionId = 's1', prompt = 'Add checkout') => {
    add(sessionId, 'UserPrompt', { prompt })
    add(sessionId, 'Read', { file_path: '/work/shop/app/page.tsx' })
    return add(sessionId, 'Write', { file_path: '/work/shop/app/api/checkout/route.ts', content: 'BODY' })
  }
  const stop = (sessionId = 's1') => hub.publish({ type: 'turn_end', sessionId, at: seq })
  const settle = async () => { await vi.runAllTimersAsync(); await rx.idle() }
  const recaps = () => got.flatMap((m) => (m.type === 'recap' ? [m.recap] : []))
  return { hub, store, got, settings, rx, add, turn, stop, settle, recaps }
}

describe('one recap per turn', () => {
  test('a turn that ends gets one call: pending, then done, stored with its decisions and terms', async () => {
    const f = fake()
    const t = setup(f.provider)
    const last = t.turn()
    t.stop()
    await t.settle()
    expect(f.tasks).toHaveLength(1)
    expect(f.tasks[0]!.maxTokens).toBe(RECAP_MAX_TOKENS)
    expect(f.tasks[0]!.user).toContain('Asked: "Add checkout"')
    expect(f.tasks[0]!.user).not.toContain('BODY')
    expect(t.recaps().map((r) => r.status)).toEqual(['pending', 'done'])
    const done = t.store.listRecaps('s1')[0]!
    expect(done).toMatchObject({ status: 'done', lastStepId: last.id, ai: { summary: 'Claude added a checkout page.', meaning: 'People can pay you now.' } })
    // nothing is failing, so the next ask is dropped
    expect(done.ai!.next).toBeUndefined()
    expect(t.store.listDecisions('s1')).toEqual([expect.objectContaining({ stepId: last.id, choice: 'Stripe', id: `${last.id}:decision:0` })])
    expect(t.store.listGlossary('s1').map((g) => g.term)).toEqual(['Checkout session'])
    expect(t.store.usage()).toEqual({ input: 100, output: 40 })
  })

  test('two decisions citing the same step are both kept', async () => {
    const second = { step: 's1', title: 'Validation', choice: 'Zod', alternatives: ['Yup'], reason: 'Types for free' }
    const t = setup(fake(() => ({ ...ANSWER, decisions: [...ANSWER.decisions, second] })).provider)
    t.turn(); t.stop(); await t.settle()
    expect(t.store.listDecisions('s1').map((d) => d.choice)).toEqual(['Stripe', 'Zod'])
  })

  test('the next ask is kept while a check still fails', async () => {
    const f = fake()
    const t = setup(f.provider)
    t.add('s1', 'UserPrompt', { prompt: 'x' })
    t.add('s1', 'Bash', { command: 'npm test' }, 'failed', 'FAIL 1 test')
    t.stop()
    await t.settle()
    expect(t.store.listRecaps('s1')[0]!.ai!.next).toBe('Fix the failing checkout test')
  })

  test('no call for a turn of only reading, or with nothing finished', async () => {
    const f = fake()
    const t = setup(f.provider)
    t.add('s1', 'UserPrompt', { prompt: 'look around' })
    t.add('s1', 'Read', { file_path: '/a.ts' })
    t.add('s1', 'Grep', { pattern: 'x' })
    t.add('s1', 'Bash', { command: 'npm test' }, 'running')
    t.stop()
    await t.settle()
    expect(f.tasks).toEqual([])
    expect(t.recaps()).toEqual([])
  })

  test('no call when recaps are off, switched off from outside, or there is no provider', async () => {
    for (const s of [setup(fake().provider, { level: 'off' }), setup(fake().provider, { disabledReason: 'SIDECAR_EXPLAINER=off' }), setup(null)]) {
      s.turn(); s.stop(); await s.settle()
      expect(s.recaps()).toEqual([])
      expect(s.store.usage()).toEqual({ input: 0, output: 0 })
    }
  })

  test('a repeated Stop with nothing new is not recapped again; new steps are, at most twice a turn', async () => {
    const f = fake()
    const t = setup(f.provider)
    t.turn(); t.stop(); await t.settle()
    t.stop(); await t.settle()
    expect(f.tasks).toHaveLength(1)
    for (let i = 0; i < 4; i++) {
      t.add('s1', 'Edit', { file_path: `/work/shop/lib/f${i}.ts`, old_string: 'a', new_string: 'b' })
      t.stop(); await t.settle()
    }
    expect(f.tasks).toHaveLength(MAX_RECAPS_PER_TURN)
    // a new turn starts the count again
    t.turn('s1', 'Next thing'); t.stop(); await t.settle()
    expect(f.tasks).toHaveLength(MAX_RECAPS_PER_TURN + 1)
  })

  test('a burst of Stops on one turn makes one call', async () => {
    const f = fake()
    const t = setup(f.provider)
    t.turn()
    for (let i = 0; i < 10; i++) t.stop()
    await t.settle()
    expect(f.tasks).toHaveLength(1)
  })

  test('calls run one at a time across sessions', async () => {
    const f = fake()
    const t = setup(f.provider)
    for (const s of ['a', 'b', 'c']) { t.turn(s); t.stop(s) }
    await t.settle()
    expect(f.tasks).toHaveLength(3)
    expect(f.most()).toBe(1)
  })
})

describe('when the model fails', () => {
  test('a retryable error is tried once more, and both attempts count their tokens', async () => {
    let n = 0
    const provider: Provider = {
      id: 'api',
      async call(task) {
        if (++n === 1) throw new ExplainError('Anthropic rate limit reached.', true, { input: 50, output: 0 })
        return { output: task.schema.parse(ANSWER), usage: { input: 100, output: 40 } }
      },
    }
    const t = setup(provider)
    t.turn(); t.stop(); await t.settle()
    expect(n).toBe(2)
    expect(t.store.listRecaps('s1')[0]!.status).toBe('done')
    expect(t.store.usage()).toEqual({ input: 150, output: 40 })
  })

  test('a non-retryable error marks the recap unavailable and pauses; later turns say why, with no call', async () => {
    let n = 0
    const provider: Provider = { id: 'api', async call() { n++; throw new ExplainError('The Anthropic API key was rejected.', false) } }
    const t = setup(provider)
    t.turn(); t.stop(); await t.settle()
    expect(t.store.listRecaps('s1')[0]).toMatchObject({ status: 'unavailable', reason: 'The Anthropic API key was rejected.' })
    expect(t.rx.state()).toMatchObject({ status: 'paused' })
    t.turn('s1', 'again'); t.stop(); await t.settle()
    expect(n).toBe(1)
    expect(t.store.listRecaps('s1').at(-1)).toMatchObject({ status: 'unavailable', reason: 'The Anthropic API key was rejected.' })
    // changing settings clears the pause
    t.rx.settingsChanged()
    expect(t.rx.state().status).toBe('ready')
  })

  test('after a pause is cleared, the turn that ended while paused gets one call', async () => {
    let n = 0
    const provider: Provider = {
      id: 'api',
      async call(task) {
        if (++n === 1) throw new ExplainError('The Anthropic API key was rejected.', false)
        return { output: task.schema.parse(ANSWER), usage: { input: 1, output: 1 } }
      },
    }
    const t = setup(provider)
    t.turn('s1', 'first'); t.stop(); await t.settle()
    t.turn('s1', 'second'); t.stop(); await t.settle()
    expect(n).toBe(1)
    t.rx.settingsChanged(); await t.settle()
    expect(n).toBe(2)
    expect(t.store.listRecaps('s1').map((r) => r.status)).toEqual(['unavailable', 'done'])
    // nothing more to catch up on
    t.rx.setProvider(provider); await t.settle()
    expect(n).toBe(2)
  })

  test('turns paused before this start are not caught up, so a restart spends nothing on old sessions', async () => {
    const hub = new Hub()
    const store = openStore(':memory:')
    const s: Step = { id: 'w1', sessionId: 'old', toolName: 'Write', input: { file_path: '/a.ts', content: 'x' }, startedAt: 1, status: 'ok' }
    store.saveStep({ ...s, ...translate(s), seq: 1 })
    store.saveRecap({ sessionId: 'old', turnId: 'w1', lastStepId: 'w1', at: 1, status: 'unavailable', reason: 'paused' })
    const f = fake()
    const rx = createRecapper({ hub, store, settings: memorySettings(), provider: null, now: () => 100 })
    rx.setProvider(f.provider)
    await vi.runAllTimersAsync(); await rx.idle()
    expect(f.tasks).toEqual([])
  })

  test('three failed recaps in a row pause', async () => {
    const t = setup(fake(() => ({ summary: ' ', meaning: ' ', next: null, decisions: [], concepts: [] })).provider)
    for (let i = 0; i < 3; i++) { t.turn('s1', `t${i}`); t.stop(); await t.settle() }
    expect(t.store.listRecaps('s1').map((r: RecapEntry) => r.reason)).toEqual(['The recap came back empty.', 'The recap came back empty.', 'The recap came back empty.'])
    expect(t.rx.state().status).toBe('paused')
  })
})

describe('no recap is left pending', () => {
  test('a provider that throws something odd ends unavailable', async () => {
    const t = setup({ id: 'api', async call() { throw new TypeError('boom') } })
    t.turn(); t.stop(); await t.settle()
    expect(t.store.listRecaps('s1')[0]).toMatchObject({ status: 'unavailable' })
  })

  test('a store write that throws after the call ends unavailable, not pending', async () => {
    const log: string[] = []
    const hub = new Hub()
    const store = openStore(':memory:')
    const rx = createRecapper({ hub, store, settings: memorySettings(), provider: fake().provider, retryDelayMs: 0, log: (m) => log.push(m) })
    vi.spyOn(store, 'addUsage').mockImplementation(() => { throw new Error('disk full') })
    const s: Step = { id: 'w1', sessionId: 's1', toolName: 'Write', input: { file_path: '/a.ts', content: 'x' }, startedAt: 1, status: 'ok' }
    store.saveStep({ ...s, ...translate(s), seq: 1 })
    hub.publish({ type: 'turn_end', sessionId: 's1', at: 2 })
    await vi.runAllTimersAsync(); await rx.idle()
    expect(store.listRecaps('s1')[0]).toMatchObject({ status: 'unavailable', reason: 'The recap was interrupted.' })
    expect(log).toEqual(['recap failed: disk full'])
  })

  test('a recap still pending from before a restart is marked unavailable, and said so', () => {
    const hub = new Hub()
    const store = openStore(':memory:')
    store.saveRecap({ sessionId: 's1', turnId: 'p1', lastStepId: 'x', at: 1, status: 'pending' })
    store.saveRecap({ sessionId: 's1', turnId: 'p0', lastStepId: 'y', at: 1, status: 'done', ai: { summary: 'S', meaning: 'M' } })
    const got: ServerMessage[] = []
    hub.subscribe((m) => got.push(m))
    createRecapper({ hub, store, settings: memorySettings(), provider: null })
    expect(store.getRecap('p1')).toMatchObject({ status: 'unavailable', reason: 'Sidecar restarted before the recap finished.', count: 1 })
    expect(store.getRecap('p0')!.status).toBe('done')
    expect(got).toEqual([{ type: 'recap', recap: expect.objectContaining({ turnId: 'p1', status: 'unavailable' }) }])
  })

  test('an unavailable recap is tried again on the next Stop, within the cap', async () => {
    let n = 0
    const t = setup(fake(() => (++n === 1 ? { summary: ' ', meaning: ' ', next: null, decisions: [], concepts: [] } : ANSWER)).provider)
    t.turn(); t.stop(); await t.settle()
    expect(t.store.listRecaps('s1')[0]!.status).toBe('unavailable')
    t.stop(); await t.settle()
    expect(t.store.listRecaps('s1')[0]!.status).toBe('done')
    t.stop(); await t.settle()
    expect(n).toBe(MAX_RECAPS_PER_TURN)
  })
})

describe('cancelled mid-flight', () => {
  const slow = () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const provider: Provider = { id: 'api', async call(task) { await gate; return { output: task.schema.parse(ANSWER), usage: { input: 1, output: 1 } } } }
    return { provider, release: () => release() }
  }
  test('a deleted session gets no writes, but its tokens still count', async () => {
    const s = slow()
    const t = setup(s.provider)
    t.turn(); t.stop()
    await vi.advanceTimersByTimeAsync(0)
    t.store.deleteSession('s1')
    t.hub.publish({ type: 'session_deleted', id: 's1' })
    s.release(); await t.settle()
    expect(t.store.listRecaps('s1')).toEqual([])
    expect(t.recaps().map((r) => r.status)).toEqual(['pending'])
    expect(t.store.usage()).toEqual({ input: 1, output: 1 })
  })
  test('a reset gets no writes', async () => {
    const s = slow()
    const t = setup(s.provider)
    t.turn(); t.stop()
    await vi.advanceTimersByTimeAsync(0)
    t.hub.publish({ type: 'reset' })
    s.release(); await t.settle()
    expect(t.recaps().map((r) => r.status)).toEqual(['pending'])
  })
  test('switching recaps off mid-flight leaves no summary, and says so', async () => {
    const s = slow()
    const t = setup(s.provider)
    t.turn(); t.stop()
    await vi.advanceTimersByTimeAsync(0)
    t.settings.set({ explanations: 'off' })
    s.release(); await t.settle()
    expect(t.store.listRecaps('s1')[0]).toMatchObject({ status: 'unavailable', reason: 'AI recaps were turned off.' })
  })
  test('the turn that ended is recapped, even when a new one starts while it waits in line', async () => {
    const s = slow()
    const t = setup(s.provider)
    t.turn('a'); t.stop('a')
    await vi.advanceTimersByTimeAsync(0)
    const asked = t.add('b', 'UserPrompt', { prompt: 'Add checkout' })
    t.add('b', 'Write', { file_path: '/work/shop/app/a.ts', content: 'x' })
    t.stop('b')
    // b's next turn begins before a's call is done
    t.add('b', 'UserPrompt', { prompt: 'Now add emails' })
    t.add('b', 'Write', { file_path: '/work/shop/app/b.ts', content: 'x' })
    s.release(); await t.settle()
    expect(t.store.listRecaps('b').map((r) => r.turnId)).toEqual([asked.id])
  })

  test('stop() ends it: no more calls or writes', async () => {
    const f = fake()
    const t = setup(f.provider)
    t.rx.stop()
    t.turn(); t.stop(); await t.settle()
    expect(f.tasks).toEqual([])
  })
})
