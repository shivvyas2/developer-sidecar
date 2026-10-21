import { describe, expect, test } from 'vitest'
import { buildRecap } from '@sidecar/shared'
import { runSession } from '../../../bench/explainer/run'
import { EDGE_SESSIONS, SESSIONS, type BenchEvent, type BenchSession } from '../../../bench/explainer/sessions'

// The bench's sample sessions, through the real hooks, pipeline and rules, then summed up.
const CWD = '/Users/sam/shop'
const sessionNamed = (name: string) => [...SESSIONS, ...EDGE_SESSIONS].find((x) => x.name === name)!
const recapOf = async (name: string) => buildRecap((await runSession(sessionNamed(name))).steps, { cwd: CWD, attention: 'done' })!

const NEXT_LOCAL = '   ▲ Next.js 16.1.0\n   - Local:        http://localhost:3000\n   - Network:      http://192.168.1.20:3000\n'
const isDevRun = (e: BenchEvent) => (e.payload.tool_input as { command?: string } | undefined)?.command === 'npm run dev'
const printsLocal = (e: BenchEvent, interrupted: boolean): BenchEvent => {
  const response = e.payload.tool_response as Record<string, unknown> | undefined
  return response ? { ...e, payload: { ...e.payload, tool_response: { ...response, stdout: NEXT_LOCAL, interrupted } } } : e
}
/**
 * The edge session's dev server, which Ctrl-C cut short, as it really looks: Next.js had printed its address before
 * it was stopped, and an earlier run of it had come up and printed the same address.
 */
function devServerCutShort(): BenchSession {
  const edge = sessionNamed('edge-cases')
  const events = edge.events.map((e) => (isDevRun(e) ? printsLocal(e, true) : e))
  const first = events.findIndex(isDevRun)
  const cameUp = events.filter(isDevRun).map((e) => {
    const up = printsLocal(e, false)
    return { ...up, payload: { ...up.payload, tool_use_id: `${String(up.payload.tool_use_id).slice(0, -2)}UP` } }
  })
  return { ...edge, events: [...events.slice(0, first), ...cameUp, ...events.slice(first)] }
}

describe('the sample sessions summed up', () => {
  test('the orders turn of the Stripe build: data and checkout changed, four packages, checks pass', async () => {
    const r = await recapOf('build-stripe-app')
    expect(r.asked).toMatch(/^Store each order in Postgres/)
    expect(r.built.map((b) => b.name)).toEqual(['Checkout', 'Database connection', 'Database tables', 'Orders table'])
    expect(r).toMatchObject({ packages: 4, checks: 'pass', outcome: 'good', state: 'done' })
    expect(r.url).toBeUndefined()
  })

  test('the repair loop ends fixed, with nothing left to ask about', async () => {
    const r = await recapOf('fix-failing-test')
    expect(r).toMatchObject({ checks: 'pass', outcome: 'fixed', fixes: 1 })
    expect(r.failingId).toBeUndefined()
  })

  test('an interrupted dev server never offers an address', async () => {
    expect((await recapOf('edge-cases')).url).toBeUndefined()
    const { steps } = await runSession(devServerCutShort())
    const cut = steps.find((s) => s.category === 'run' && s.status === 'failed')!
    expect(JSON.stringify(cut.output)).toContain('http://localhost:3000')
    // until it was cut short the server was up, with its address on offer
    expect(buildRecap(steps.slice(0, steps.indexOf(cut)), { cwd: CWD, attention: 'done' })!.url).toBe('http://localhost:3000')
    expect(buildRecap(steps, { cwd: CWD, attention: 'done' })!.url).toBeUndefined()
  })

  test('no secret value lands in a recap', async () => {
    for (const s of [...SESSIONS, ...EDGE_SESSIONS]) expect(JSON.stringify(await recapOf(s.name))).not.toMatch(/sk_(test|live)_|whsec_/)
  })
})
