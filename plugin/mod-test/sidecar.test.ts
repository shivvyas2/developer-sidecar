import { expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const
const PLUGIN = 'developer-sidecar'

type Status = 'running' | 'ok' | 'failed'
const step = (n: number, category: string, status: Status, extra: Record<string, unknown> = {}) => ({
  id: `s${n}`, sessionId: 'S1', seq: n, toolName: 'Bash', input: {}, startedAt: n * 1000, status, category,
  caption: `Caption ${n}`, techLabel: 'Bash: pnpm add stripe',
  scene: { scene: 'unpack-toolbox', cast: ['claude', { place: 'toolbox' }], beats: [{ actor: 'claude', do: 'walkTo', to: 'toolbox' }, { actor: 'claude', do: 'unpack', to: 'toolbox' }], caption: `Caption ${n}` },
  ...extra,
})

interface World {
  steps: unknown[]
  online: boolean
  port: number
  statuses: (string | undefined)[]
  toasts: string[]
  runs: string[][]
  urls: string[]
  sid: string
  hang: boolean
  renders: number
  clock: { advance(ms: number): Promise<void>; settle(): Promise<void> }
}

// on is the test's registrar; its hooks stand beneath the mod.
function world(on: any, steps: unknown[] = []): World {
  const w = { steps, online: true, port: 7391, statuses: [], toasts: [], runs: [], urls: [], sid: 'S1', hang: false, renders: 0 } as unknown as World
  w.clock = mock.clock(on)
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.id', async () => ({ value: w.sid }))
  on('command.register', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  // What the engine draws when the band passes with next(e): an empty box of its own.
  on('ui.render', async () => { w.renders += 1; return { type: 'Box', props: {}, children: [] } })
  on('ui.status', async (_$: unknown, e: { text?: string }) => { w.statuses.push(e.text); return { value: undefined } })
  on('ui.toast', async (_$: unknown, e: { text: string }) => { w.toasts.push(e.text); return { value: undefined } })
  on('process.run', async (_$: unknown, e: { argv: string[] }) => {
    w.runs.push(e.argv)
    const out = e.argv.some((a) => a.endsWith('locate.cjs')) ? JSON.stringify({ port: w.port, token: 'T' }) : ''
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('http.fetch', async (_$: unknown, e: { url: string; init?: { headers?: Record<string, string> } }) => {
    w.urls.push(e.url)
    // A server that accepts the connection and never answers.
    if (w.hang) return new Promise(() => {})
    // The mod treats a refused connection and a non-ok answer the same way; a non-ok answer keeps the test's hook from failing the test.
    if (!w.online) return { value: { status: 503, ok: false, headers: {}, text: '' } }
    expect(e.init?.headers?.['x-sidecar-token']).toBe('T')
    const body = e.url.endsWith('/api/explainer')
      ? { level: 'haiku', provider: 'api', status: 'ready', tokens: { input: 1000, output: 234 } }
      : w.steps
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
  })
  return w
}

async function start($: any, w: World) {
  await $.session.start({ source: 'startup', cwd: '/work/shop', surface: 'terminal' })
  await w.clock.settle()
}

test('locates the server and polls the session steps with the token', async ($, on) => {
  const w = world(on, [step(1, 'install', 'running')])
  await start($, w)
  expect(w.runs[0]?.at(-1)).toMatch(/dist\/locate\.cjs$/)
  expect(w.urls).toContain('http://127.0.0.1:7391/api/sessions/S1/steps')
  expect(w.statuses.at(-1)).toBe('◢ 001 INSTALL · PNPM ADD STRIPE ●')
})

test('no toasts for steps that were there on the first poll, then one per milestone', async ($, on) => {
  const w = world(on, [step(1, 'test', 'failed')])
  await start($, w)
  expect(w.toasts).toEqual([])
  w.steps = [step(1, 'test', 'failed'), step(2, 'test', 'ok')]
  await w.clock.advance(1000)
  expect(w.toasts).toEqual(['✓ TESTS PASSED · 002'])
  await w.clock.advance(1000)
  expect(w.toasts).toEqual(['✓ TESTS PASSED · 002'])
})

test('/sidecar web, off and on', async ($, on) => {
  const w = world(on, [step(1, 'install', 'ok')])
  await start($, w)
  expect(await $.command.run({ command: 'sidecar', args: 'web' } as never)).toMatchObject({ text: expect.stringContaining('http://localhost:7391') })
  await $.command.run({ command: 'sidecar', args: 'off' } as never)
  w.steps = [step(1, 'install', 'ok'), step(2, 'deploy', 'ok')]
  await w.clock.advance(1000)
  expect(w.toasts).toEqual([])
  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(await band.find({ text: /Caption 2/ })).toBeUndefined()
  await $.command.run({ command: 'sidecar', args: 'on' } as never)
  await band.redraw()
  expect(await band.find({ text: /Caption 2/ })).toBeDefined()
  expect(await $.command.run({ command: 'sidecar', args: 'nope' } as never)).toMatchObject({ text: expect.stringContaining('/sidecar web') })
})

for (const surface of SURFACES) {
  test(`pane on ${surface}: readout, latest card, offline strip`, async ($, on) => {
    const w = world(on, [step(1, 'install', 'ok'), step(2, 'install', 'running', { explanation: { plain: 'Adds the Stripe kit.', why: 'Payments.', concept: null, decision: null } })])
    await start($, w)
    await $.command.run({ command: 'sidecar', args: '' } as never)
    const pane = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', props: {} as never, requestId: 'sidecar', viewport: { columns: 80, rows: 30 } })
    expect(await pane.find({ text: /Adds the Stripe kit\./ })).toBeDefined()
    expect(await pane.find({ text: /002/ })).toBeDefined()
    const svgs = await pane.findAll({ type: 'Svg' })
    expect(svgs.length).toBe(surface === 'desktop' ? 1 : 0)
    w.online = false
    await w.clock.advance(1000)
    await pane.redraw()
    expect(await pane.find({ text: /SIDECAR OFFLINE/ })).toBeDefined()
    expect(w.statuses.at(-1)).toBeUndefined()
  })

  test(`band on ${surface}: shows the latest explanation, hides on a survey and on Hide`, async ($, on) => {
    const w = world(on, [step(1, 'install', 'ok', { explanation: { plain: 'Adds Stripe.', why: 'x', concept: null, decision: null } })])
    await start($, w)
    const band = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })
    expect(await band.find({ text: /Adds Stripe\./ })).toBeDefined()
    const survey = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: { hasSurvey: true } as never })
    expect(await survey.find({ text: /Adds Stripe\./ })).toBeUndefined()
    await band.press({ key: 'hide' })
    expect(await band.find({ text: /Adds Stripe\./ })).toBeUndefined()
  })
}

test('no band before the first step', async ($, on) => {
  const w = world(on, [])
  await start($, w)
  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(await band.find({ text: /OPEN WORKSTATION/ })).toBeUndefined()
})

test('relocates after going offline and starts the server once', async ($, on) => {
  const w = world(on, [step(1, 'install', 'ok')])
  await start($, w)
  w.online = false
  for (let i = 0; i < 4; i++) await w.clock.advance(5000)
  const locates = w.runs.filter((r) => r.some((a) => a.endsWith('locate.cjs'))).length
  const starts = w.runs.filter((r) => r.some((a) => a.endsWith('start-server.cjs'))).length
  expect(locates).toBeGreaterThanOrEqual(3)
  expect(starts).toBe(1)
  w.online = true
  w.port = 7392
  await w.clock.advance(5000)
  expect(w.urls.at(-1)).toMatch(/^http:\/\/127\.0\.0\.1:7392\//)
  expect(w.statuses.at(-1)).toMatch(/^◢ 001 /)
})

test('review C1: a failed first poll does not turn history into toasts', async ($, on) => {
  const w = world(on, [step(1, 'test', 'failed'), step(2, 'deploy', 'ok')])
  w.online = false
  await start($, w)
  w.online = true
  for (let i = 0; i < 3; i++) await w.clock.advance(5000)
  expect(w.statuses.at(-1)).toMatch(/^◢ 002 /)
  expect(w.toasts).toEqual([])
})

test('review C2: after /clear the mod follows the new session id, fresh', async ($, on) => {
  const w = world(on, [step(1, 'install', 'ok')])
  await start($, w)
  await $.command.run({ command: 'sidecar', args: 'off' } as never)
  w.sid = 'S2'
  w.steps = [step(1, 'test', 'failed'), step(2, 'test', 'failed'), step(3, 'install', 'running')]
  await w.clock.advance(1000)
  await w.clock.advance(1000)
  expect(w.urls.at(-1)).toMatch(/\/api\/(sessions\/S2\/steps|explainer)$/)
  expect(w.urls.some((u) => u.includes('/api/sessions/S2/steps'))).toBe(true)
  expect(w.statuses.at(-1)).toMatch(/^◢ 003 /)
  expect(w.toasts).toEqual([])
  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(await band.find({ text: /Caption 3/ })).toBeDefined()
})

test('review I1: the scene timer stops when the pane goes offline', async ($, on) => {
  const w = world(on, [step(1, 'install', 'running')])
  await start($, w)
  await $.command.run({ command: 'sidecar', args: 'off' } as never)
  const band = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  const pane = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', props: {} as never, requestId: 'sidecar', viewport: { columns: 80, rows: 30 } })
  expect((await pane.findAll({ type: 'Svg' })).length).toBe(1)
  w.online = false
  await w.clock.advance(1000)
  await pane.redraw()
  expect(await pane.find({ text: /SIDECAR OFFLINE/ })).toBeDefined()
  const before = w.renders
  await w.clock.advance(3000)
  expect(w.renders - before).toBeLessThan(3)
  expect(band).toBeDefined()
})

test('review I2: a server that never answers does not hold up the session or stop polling', async ($, on) => {
  const w = world(on, [step(1, 'install', 'ok')])
  w.hang = true
  await $.session.start({ source: 'startup', cwd: '/work/shop', surface: 'terminal' })
  w.hang = false
  for (let i = 0; i < 4; i++) await w.clock.advance(5000)
  expect(w.statuses.at(-1)).toMatch(/^◢ 001 /)
})
