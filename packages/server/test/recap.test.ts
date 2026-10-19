import { describe, expect, test } from 'vitest'
import { buildRecap } from '@sidecar/shared'
import { runSession } from '../../../bench/explainer/run'
import { EDGE_SESSIONS, SESSIONS } from '../../../bench/explainer/sessions'

// The bench's sample sessions, through the real hooks, pipeline and rules, then summed up.
const CWD = '/Users/sam/shop'
const recapOf = async (name: string) => {
  const s = [...SESSIONS, ...EDGE_SESSIONS].find((x) => x.name === name)!
  return buildRecap((await runSession(s)).steps, { cwd: CWD, attention: 'done' })!
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
  })

  test('no secret value lands in a recap', async () => {
    for (const s of [...SESSIONS, ...EDGE_SESSIONS]) expect(JSON.stringify(await recapOf(s.name))).not.toMatch(/sk_(test|live)_|whsec_/)
  })
})
