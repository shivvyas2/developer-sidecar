import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FeedStep, ServerMessage } from '@sidecar/shared'
import { createExplainer, MAX_BATCH, MAX_WAIT_MS, QUIET_MS, UNAVAILABLE_REASON } from '../src/explainer/service'
import { ExplainError, type Provider } from '../src/explainer/providers'
import { Hub } from '../src/hub'
import { memorySettings } from '../src/settings'
import { openStore } from '../src/store'

const step = (id: string, over: Partial<FeedStep> = {}): FeedStep => ({
  id, sessionId: 's1', toolName: 'Bash', input: { command: `cmd ${id}` }, startedAt: 1, endedAt: 2, status: 'ok', seq: 1,
  category: 'install', caption: id, techLabel: 'npm i', scene: { scene: 'thinking', cast: [], beats: [], caption: id }, ...over,
})

function fakeProvider(behaviour: (ids: string[]) => Promise<unknown> | unknown = (ids) => ({ items: ids.map((stepId) => ({
  stepId, plain: `did ${stepId}`, why: 'matters', concept: { term: 'Package', definition: 'reused code' },
  decision: stepId === 'd' ? { title: 'Payments', choice: 'Stripe', alternatives: ['Paddle'], reason: 'common' } : null,
})) })) {
  const calls: string[][] = []
  // Requests number their steps 1…n; tests name steps by their caption (= id) and answer with those names.
  const provider: Provider = {
    id: 'api',
    async explain(req) {
      const sent = req.user.split('\n').filter((l) => l.startsWith('{"stepId"')).map((l) => JSON.parse(l) as { stepId: string; caption: string })
      const ids = sent.map((s) => s.caption)
      calls.push(ids)
      const out = await behaviour(ids) as { items?: Array<{ stepId: string }> } | null
      for (const it of out?.items ?? []) {
        const i = ids.indexOf(it.stepId)
        if (i >= 0) it.stepId = sent[i]!.stepId
      }
      return { output: out as never, usage: { input: 10, output: 5 } }
    },
  }
  return { provider, calls }
}

function setup(provider: Provider | null, level: 'off' | 'haiku' | 'sonnet' = 'haiku', extra: { log?: (msg: string) => void } = {}) {
  const hub = new Hub()
  const store = openStore(':memory:')
  store.touchSession('s1', '/work/shop', 1)
  const settings = memorySettings({ explanations: level })
  const got: ServerMessage[] = []
  hub.subscribe((m) => got.push(m))
  const ex = createExplainer({ hub, store, settings, provider, retryDelayMs: 10, ...extra })
  const send = (s: FeedStep) => { store.saveStep(s); hub.publish({ type: 'step', step: s }) }
  return { hub, store, settings, got, ex, send }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('explainer', () => {
  test('waits for quiet, explains in one batch, stores and publishes explanation/decision/concept/state', async () => {
    const { provider, calls } = fakeProvider()
    const { got, ex, send, store } = setup(provider)
    send(step('a')); send(step('d'))
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1)
    expect(calls).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await ex.idle()
    expect(calls).toEqual([['a', 'd']])
    expect(store.stepsForSession('s1').map((s) => s.explanation && 'plain' in s.explanation ? s.explanation.plain : null)).toEqual(['did a', 'did d'])
    expect(got.filter((m) => m.type === 'explanation')).toHaveLength(2)
    expect(got.filter((m) => m.type === 'decision').map((m) => m.type === 'decision' && m.decision.id)).toEqual(['d:decision'])
    expect(got.filter((m) => m.type === 'concept')).toHaveLength(1) // same term twice → published once
    expect(ex.state()).toMatchObject({ status: 'ready', provider: 'api', tokens: { input: 10, output: 5 } })
  })

  test('skips running, interrupted, prompt and already explained steps', async () => {
    const { provider, calls } = fakeProvider()
    const { ex, send, store } = setup(provider)
    store.saveExplanation('s1', 'done', { unavailable: 'x' }, 1)
    send(step('r', { status: 'running' })); send(step('i', { status: 'interrupted' }))
    send(step('p', { category: 'prompt' })); send(step('done'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toEqual([])
  })

  describe('routine steps', () => {
    const read = (id: string, status: FeedStep['status'] = 'ok') =>
      step(id, { toolName: 'Read', category: 'read', input: { file_path: '/work/shop/a.ts' }, status })
    const write = (id: string, file: string) => step(id, { toolName: 'Write', category: 'create', input: { file_path: file, content: 'x' } })
    const edit = (id: string, file: string, status: FeedStep['status'] = 'ok') =>
      step(id, { toolName: 'Edit', category: 'edit', input: { file_path: file, old_string: 'a', new_string: 'b' }, status })
    const prompt = (id: string) => step(id, { toolName: 'UserPrompt', category: 'prompt', input: { prompt: 'go' } })
    const flushed = async (ex: { idle(): Promise<void> }) => { await vi.advanceTimersByTimeAsync(QUIET_MS); await ex.idle() }

    test('a successful read is skipped; a failed one is explained', async () => {
      const { provider, calls } = fakeProvider()
      const { ex, send } = setup(provider)
      send(read('r1')); send(read('r2', 'failed'))
      await flushed(ex)
      expect(calls).toEqual([['r2']])
    })

    test('the first edit to a file is explained, repeats are not, a failed repeat is, and a prompt starts over', async () => {
      const { provider, calls } = fakeProvider()
      const { ex, send } = setup(provider)
      send(write('w', '/a.ts')); send(edit('e1', '/a.ts')); send(edit('e2', '/b.ts')); send(edit('e3', '/b.ts'))
      send(edit('e4', '/b.ts', 'failed'))
      send(prompt('p')); send(edit('e5', '/b.ts')); send(edit('e6', '/b.ts'))
      await flushed(ex)
      expect(calls.flat()).toEqual(['w', 'e2', 'e4', 'e5'])
    })

    test('routine steps keep the batch waiting, so it is not split around them', async () => {
      const { provider, calls } = fakeProvider()
      const { ex, send } = setup(provider)
      send(step('a'))
      for (let i = 0; i < 3; i++) { await vi.advanceTimersByTimeAsync(QUIET_MS - 500); send(read(`r${i}`)) }
      await vi.advanceTimersByTimeAsync(QUIET_MS - 500)
      send(step('b'))
      await flushed(ex)
      expect(calls).toEqual([['a', 'b']])
    })

    test('a long run of routine steps still flushes once the oldest step has waited MAX_WAIT_MS', async () => {
      const { provider, calls } = fakeProvider()
      const { ex, send } = setup(provider)
      send(step('a'))
      for (let t = QUIET_MS - 500; t < MAX_WAIT_MS; t += QUIET_MS - 500) {
        await vi.advanceTimersByTimeAsync(QUIET_MS - 500)
        send(read(`r${t}`))
      }
      expect(calls).toEqual([])
      await vi.advanceTimersByTimeAsync(QUIET_MS - 500)
      await ex.idle()
      expect(calls).toEqual([['a']])
    })

    test('after a restart, files written earlier in the request are read back from the store', async () => {
      const { provider, calls } = fakeProvider()
      const hub = new Hub()
      const store = openStore(':memory:')
      store.touchSession('s1', '/work/shop', 1)
      for (const s of [prompt('p'), write('w', '/a.ts')]) store.saveStep(s)
      const ex = createExplainer({ hub, store, settings: memorySettings({ explanations: 'haiku' }), provider, retryDelayMs: 10 })
      const send = (s: FeedStep) => { store.saveStep(s); hub.publish({ type: 'step', step: s }) }
      send(edit('e1', '/a.ts')); send(edit('e2', '/c.ts'))
      await flushed(ex)
      expect(calls.flat()).toEqual(['e2'])
    })

    test('deleting a session forgets its written files', async () => {
      const { provider, calls } = fakeProvider()
      const { ex, send, hub, store } = setup(provider)
      send(edit('e1', '/a.ts'))
      await flushed(ex)
      hub.publish({ type: 'session_deleted', id: 's1' })
      store.deleteSession('s1')
      store.touchSession('s1', '/work/shop', 2)
      send(edit('e2', '/a.ts'))
      await flushed(ex)
      expect(calls.flat()).toEqual(['e1', 'e2'])
    })
  })

  describe('short step ids', () => {
    const answer = (stepId: string, plain: string) => ({ stepId, plain, why: 'w', concept: null, decision: null })

    test('requests number steps 1…n instead of sending tool-use ids, and answers map back in any order', async () => {
      const users: string[] = []
      const provider: Provider = {
        id: 'api',
        async explain(req) {
          users.push(req.user)
          return { output: { items: [answer('2', 'second'), answer('1', 'first')] }, usage: { input: 1, output: 1 } }
        },
      }
      const { ex, send, store } = setup(provider)
      send(step('toolu_01AAAAAAAAAAAAAAAAAAAAAA')); send(step('toolu_01BBBBBBBBBBBBBBBBBBBBBB'))
      await vi.advanceTimersByTimeAsync(QUIET_MS)
      await ex.idle()
      expect(users[0]).toContain('"stepId":"1"')
      expect(users[0]).toContain('"stepId":"2"')
      expect(users[0]).not.toContain('"stepId":"toolu_')
      const plain = (id: string) => { const e = store.stepsForSession('s1').find((x) => x.id === id)?.explanation; return e && 'plain' in e ? e.plain : e }
      expect(plain('toolu_01AAAAAAAAAAAAAAAAAAAAAA')).toBe('first')
      expect(plain('toolu_01BBBBBBBBBBBBBBBBBBBBBB')).toBe('second')
    })

    test('an answer with an unknown number, or a real id, lands on no step', async () => {
      const provider: Provider = {
        id: 'api',
        async explain() {
          return { output: { items: [answer('9', 'ghost'), answer('a', 'by real id')] }, usage: { input: 1, output: 1 } }
        },
      }
      const { ex, send, store } = setup(provider)
      send(step('a'))
      await vi.advanceTimersByTimeAsync(QUIET_MS)
      await ex.idle()
      expect(store.stepsForSession('s1')[0]!.explanation).toEqual({ unavailable: 'No explanation was returned for this step.' })
    })
  })

  test('a 20-step burst becomes batches of at most MAX_BATCH, one request at a time (Review Focus 5)', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const { provider, calls } = fakeProvider(async (ids) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 50))
      inFlight--
      return { items: ids.map((stepId) => ({ stepId, plain: 'p', why: 'w', concept: null, decision: null })) }
    })
    const { ex, send } = setup(provider)
    for (let i = 0; i < 20; i++) send(step(`s${i}`))
    await vi.advanceTimersByTimeAsync(QUIET_MS + 500)
    await ex.idle()
    expect(calls.map((c) => c.length)).toEqual([MAX_BATCH, MAX_BATCH, 4])
    expect(maxInFlight).toBe(1)
  })

  test('retries once, then marks the batch unavailable; pauses after 3 failed batches (Review Focus 3)', async () => {
    const { provider, calls } = fakeProvider(() => { throw new ExplainError('Anthropic rate limit reached.', true) })
    const { got, ex, send, store } = setup(provider)
    for (const id of ['a', 'b', 'c']) {
      send(step(id))
      await vi.advanceTimersByTimeAsync(QUIET_MS + 20)
      await ex.idle()
    }
    expect(calls).toHaveLength(6) // each batch tried twice
    expect(store.stepsForSession('s1')[0]!.explanation).toEqual({ unavailable: 'Anthropic rate limit reached.' })
    expect(ex.state()).toMatchObject({ status: 'paused', reason: 'Anthropic rate limit reached.' })
    send(step('later'))
    await vi.advanceTimersByTimeAsync(QUIET_MS + 20)
    await ex.idle()
    expect(calls).toHaveLength(6) // paused: no more calls
    expect(got.some((m) => m.type === 'explainer' && m.state.status === 'paused')).toBe(true)
  })

  test('a non-retryable error pauses at once without retry', async () => {
    const { provider, calls } = fakeProvider(() => { throw new ExplainError('The Anthropic API key was rejected.', false) })
    const { ex, send } = setup(provider)
    send(step('a'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toHaveLength(1)
    expect(ex.state()).toMatchObject({ status: 'paused', reason: 'The Anthropic API key was rejected.' })
  })

  test('settingsChanged clears a pause; switching to off drops queued steps (Review Focus 5)', async () => {
    const { provider, calls } = fakeProvider()
    const { ex, send, settings } = setup(provider)
    send(step('a'))
    settings.set({ explanations: 'off' })
    ex.settingsChanged()
    await vi.advanceTimersByTimeAsync(QUIET_MS * 2)
    await ex.idle()
    expect(calls).toEqual([])
    expect(ex.state().status).toBe('off')
    send(step('b'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    expect(calls).toEqual([])
  })

  test('deleting a session drops its queue', async () => {
    const { provider, calls } = fakeProvider()
    const { ex, send, hub } = setup(provider)
    send(step('a'))
    hub.publish({ type: 'session_deleted', id: 's1' })
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toEqual([])
  })

  test('steps the model skipped are marked unavailable', async () => {
    const { provider } = fakeProvider(() => ({ items: [] }))
    const { ex, send, store } = setup(provider)
    send(step('a'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(store.stepsForSession('s1')[0]!.explanation).toEqual({ unavailable: 'No explanation was returned for this step.' })
  })

  test('no provider → unavailable state with a helpful reason; level off → off', () => {
    expect(setup(null).ex.state()).toMatchObject({ status: 'unavailable', provider: null, reason: UNAVAILABLE_REASON })
    expect(setup(fakeProvider().provider, 'off').ex.state()).toMatchObject({ status: 'off', level: 'off' })
  })

  test('sends the project name and the latest prompt as context', async () => {
    let user = ''
    const provider: Provider = { id: 'api', async explain(req) { user = req.user; return { output: { items: [] }, usage: { input: 0, output: 0 } } } }
    const { ex, send, store } = setup(provider)
    store.saveStep(step('p', { category: 'prompt', toolName: 'UserPrompt', input: { prompt: 'add checkout' } }))
    send(step('a'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(user).toContain('shop')
    expect(user).toContain('add checkout')
  })

  const slow = (ms = 100) => fakeProvider(async (ids) => {
    await new Promise((r) => setTimeout(r, ms))
    return { items: ids.map((stepId) => ({ stepId, plain: 'p', why: 'w', concept: { term: `T${stepId}`, definition: 'd' }, decision: null })) }
  })

  test('tokens are counted even when the batch is dropped mid-flight (session deleted)', async () => {
    const { provider, calls } = slow()
    const { ex, send, hub, store } = setup(provider)
    send(step('a'))
    await vi.advanceTimersByTimeAsync(QUIET_MS + 10)
    expect(calls).toHaveLength(1)
    hub.publish({ type: 'session_deleted', id: 's1' })
    await vi.advanceTimersByTimeAsync(200)
    await ex.idle()
    expect(ex.state().tokens).toEqual({ input: 10, output: 5 })
    expect(store.hasExplanation('a')).toBe(false)
  })

  test('reset drops in-flight and chained batches without writing or publishing', async () => {
    const { provider, calls } = slow(QUIET_MS * 2)
    const { ex, send, hub, store, got } = setup(provider)
    for (let i = 0; i < MAX_BATCH + 2; i++) send(step(`s${i}`)) // 8 flush at once, 2 follow after quiet
    await vi.advanceTimersByTimeAsync(QUIET_MS + 10) // second batch is chained behind the first
    expect(calls).toHaveLength(1)
    hub.publish({ type: 'reset' })
    await vi.advanceTimersByTimeAsync(QUIET_MS * 3)
    await ex.idle()
    expect(calls).toHaveLength(1) // the chained batch never called the provider
    expect(store.hasExplanation('s0')).toBe(false)
    expect(got.filter((m) => ['explanation', 'decision', 'concept'].includes(m.type))).toEqual([])
    expect(ex.state().tokens).toEqual({ input: 10, output: 5 })
  })

  test('batches waiting on the chain when a pause begins are marked unavailable', async () => {
    const { provider, calls } = fakeProvider(async () => {
      await new Promise((r) => setTimeout(r, 50))
      throw new ExplainError('The Anthropic API key was rejected.', false)
    })
    const { ex, send, store } = setup(provider)
    for (let i = 0; i < MAX_BATCH + 1; i++) send(step(`s${i}`))
    await vi.advanceTimersByTimeAsync(QUIET_MS + 10)
    await vi.advanceTimersByTimeAsync(500)
    await ex.idle()
    expect(calls).toHaveLength(1)
    const last = store.stepsForSession('s1').find((s) => s.id === `s${MAX_BATCH}`)!
    expect(last.explanation).toEqual({ unavailable: 'The Anthropic API key was rejected.' })
  })

  test('a step republished while its batch is in flight is explained once', async () => {
    const { provider, calls } = slow()
    const { ex, send } = setup(provider)
    const a = step('a')
    send(a)
    await vi.advanceTimersByTimeAsync(QUIET_MS + 10)
    send(a)
    await vi.advanceTimersByTimeAsync(QUIET_MS + 300)
    await ex.idle()
    expect(calls).toEqual([['a']])
  })

  test('settingsChanged clears a real pause so a new step is explained again', async () => {
    let fail = true
    const { provider, calls } = fakeProvider((ids) => {
      if (fail) throw new ExplainError('The Anthropic API key was rejected.', false)
      return { items: ids.map((stepId) => ({ stepId, plain: 'p', why: 'w', concept: null, decision: null })) }
    })
    const { ex, send } = setup(provider)
    send(step('a'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(ex.state().status).toBe('paused')
    fail = false
    ex.settingsChanged()
    expect(ex.state().status).toBe('ready')
    send(step('b'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toEqual([['a'], ['b']])
  })

  test('setProvider: nothing queued while null; later steps are explained and state is published', async () => {
    const { provider, calls } = fakeProvider()
    const { got, ex, send } = setup(null)
    send(step('a'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toEqual([])
    got.length = 0
    ex.setProvider(provider)
    expect(got).toContainEqual({ type: 'explainer', state: expect.objectContaining({ status: 'ready', provider: 'api' }) })
    send(step('b'))
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toEqual([['b']])
  })
  test('disabledReason reports off with that reason and queues nothing', async () => {
    const { provider, calls } = fakeProvider()
    const hub = new Hub()
    const store = openStore(':memory:')
    store.touchSession('s1', '/work/shop', 1)
    const ex = createExplainer({ hub, store, settings: memorySettings({ explanations: 'haiku' }), provider, disabledReason: 'Turned off by SIDECAR_EXPLAINER=off.' })
    expect(ex.state()).toMatchObject({ status: 'off', reason: 'Turned off by SIDECAR_EXPLAINER=off.' })
    const s = step('a'); store.saveStep(s); hub.publish({ type: 'step', step: s })
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toEqual([])
  })

  test('switching to off stops batches already chained from calling the provider (final fix 1)', async () => {
    const { provider, calls } = slow(QUIET_MS)
    const { ex, send, settings, got } = setup(provider)
    for (let i = 0; i < 20; i++) send(step(`s${i}`)) // 3 batches: 8 flush at once, 8 at once, 4 after quiet
    await vi.advanceTimersByTimeAsync(10) // the first call has started; the second batch is chained
    expect(calls).toHaveLength(1)
    settings.set({ explanations: 'off' })
    ex.settingsChanged()
    await vi.advanceTimersByTimeAsync(QUIET_MS * 10)
    await ex.idle()
    expect(calls).toHaveLength(1)
    expect(got.filter((m) => ['explanation', 'decision', 'concept'].includes(m.type))).toEqual([])
  })

  test('stop() stops batches already chained from calling the provider (final fix 1)', async () => {
    const { provider, calls } = slow(QUIET_MS)
    const { ex, send, got } = setup(provider)
    for (let i = 0; i < 20; i++) send(step(`s${i}`))
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toHaveLength(1)
    ex.stop()
    await vi.advanceTimersByTimeAsync(QUIET_MS * 10)
    await ex.idle()
    expect(calls).toHaveLength(1)
    expect(got.filter((m) => ['explanation', 'decision', 'concept'].includes(m.type))).toEqual([])
  })

  test('switching to off during the retry wait skips the retry (final fix 1)', async () => {
    const { provider, calls } = fakeProvider(() => { throw new ExplainError('Anthropic rate limit reached.', true) })
    const hub = new Hub()
    const store = openStore(':memory:')
    store.touchSession('s1', '/work/shop', 1)
    const settings = memorySettings({ explanations: 'haiku' })
    const ex = createExplainer({ hub, store, settings, provider, retryDelayMs: 1000 })
    const s = step('a'); store.saveStep(s); hub.publish({ type: 'step', step: s })
    await vi.advanceTimersByTimeAsync(QUIET_MS + 10)
    expect(calls).toHaveLength(1)
    settings.set({ explanations: 'off' })
    ex.settingsChanged()
    await vi.advanceTimersByTimeAsync(2000)
    await ex.idle()
    expect(calls).toHaveLength(1)
    expect(store.hasExplanation('a')).toBe(false)
  })

  test('usage carried by failed attempts is counted (final fix 2)', async () => {
    const { provider } = fakeProvider(() => { throw new ExplainError('The explanation came back malformed.', true, { input: 7, output: 3 }) })
    const { ex, send } = setup(provider)
    send(step('a'))
    await vi.advanceTimersByTimeAsync(QUIET_MS + 50)
    await ex.idle()
    expect(ex.state().tokens).toEqual({ input: 14, output: 6 }) // both attempts
  })

  test('a store error releases the batch, is logged, and the chain keeps working (final fix 4)', async () => {
    const { provider, calls } = fakeProvider()
    const logs: string[] = []
    const { ex, send, store } = setup(provider, 'haiku', { log: (m) => logs.push(m) })
    const save = store.saveExplanation.bind(store)
    let thrown = false
    store.saveExplanation = (...args: Parameters<typeof save>) => {
      if (!thrown) { thrown = true; throw new Error('disk full') }
      return save(...args)
    }
    const a = step('a')
    send(a)
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(logs.some((l) => l.includes('disk full'))).toBe(true)
    expect(store.hasExplanation('a')).toBe(false)
    send(a) // republished: no longer held in flight
    await vi.advanceTimersByTimeAsync(QUIET_MS)
    await ex.idle()
    expect(calls).toEqual([['a'], ['a']])
    expect(store.hasExplanation('a')).toBe(true)
  })
})
