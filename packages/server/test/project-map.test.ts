import { describe, expect, test } from 'vitest'
import { projectMap } from '@sidecar/shared'
import { runSession } from '../../../bench/explainer/run'
import { SESSIONS } from '../../../bench/explainer/sessions'

// The bench's sample sessions, through the real hooks, pipeline and rules, then onto the map.
const CWD = '/Users/sam/shop'
const mapOf = async (name: string) => {
  const run = await runSession(SESSIONS.find((s) => s.name === name)!)
  const map = projectMap(run.steps, CWD)
  const items = Object.fromEntries(map.sections.map((s) => [s.kind, s.items.map((i) => `${i.name}:${i.state}`)]))
  return { map, items }
}

describe('the sample sessions on the project map', () => {
  test('building Stripe checkout names the pages, checkout, orders, Stripe, secrets and checks', async () => {
    const { items } = await mapOf('build-stripe-app')
    expect(items).toEqual({
      page: ['Site layout:seen', 'Home page:changed', 'Buy button:changed', 'Success page:changed'],
      backend: ['Checkout:changed'],
      data: ['Database connection:changed', 'Database tables:changed', 'Orders table:changed'],
      service: ['Stripe:changed'],
      secrets: ['.env.local:changed'],
      checks: ['Checkout checks:changed'],
      code: ['Products:seen'],
      blocks: ['stripe:changed', 'drizzle-orm:changed', 'pg:changed', 'drizzle-kit:changed', '@types/pg:changed'],
    })
  })

  test('the repair loop ends with auth changed, not failed, because the last change worked', async () => {
    const { items } = await mapOf('fix-failing-test')
    expect(items.code).toEqual(['Auth:changed'])
    expect(items.checks).toEqual(['Auth checks:changed'])
  })

  test('exploring shows the existing app as seen, with only the change marked', async () => {
    const { items } = await mapOf('explore-codebase')
    expect(items.page).toEqual(['Site layout:seen', 'Home page:seen', 'Buy button:seen'])
    expect(items.backend).toEqual(['Checkout:changed'])
    expect(items.secrets).toEqual(['.env.example:seen'])
    expect(items.blocks).toEqual(['zod:changed'])
  })

  test('no secret value ever lands on the map', async () => {
    for (const s of SESSIONS) {
      const { map } = await mapOf(s.name)
      expect(JSON.stringify(map)).not.toMatch(/sk_(test|live)_|whsec_/)
    }
  })
})
