import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { FeedStep } from '@sidecar/shared'
import { runSession } from '../../../bench/explainer/run'
import { SESSIONS } from '../../../bench/explainer/sessions'

/**
 * The workstation's first-run demo plays the bench's build-stripe-app session. This builds it through
 * the real hooks, pipeline and rules, keeps only what the screen shows (no outputs, short inputs),
 * and checks the committed copy is current. DEMO_UPDATE=1 rewrites it.
 */
const FILE = new URL('../../../apps/web/src/demo/sample.json', import.meta.url)
const SHORT = 160

const shorten = (v: unknown): unknown => {
  if (typeof v === 'string') return v.length > SHORT ? `${v.slice(0, SHORT)}…` : v
  if (Array.isArray(v)) return v.slice(0, 3).map(shorten)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shorten(x)]))
  return v
}

const sample = async () => {
  const run = await runSession(SESSIONS.find((s) => s.name === 'build-stripe-app')!)
  const steps = run.steps.map(({ output: _o, explanation: _e, ...s }) => ({ ...s, input: shorten(s.input) }) as FeedStep)
  return { project: 'shop', cwd: '/Users/sam/shop', steps }
}

test('the demo sample is built from the bench session and is current', async () => {
  const want = `${JSON.stringify(await sample(), null, 1)}\n`
  if (process.env.DEMO_UPDATE === '1' || !existsSync(FILE)) writeFileSync(FILE, want)
  expect(readFileSync(FILE, 'utf8'), 'run DEMO_UPDATE=1 pnpm test to rebuild apps/web/src/demo/sample.json').toBe(want)
})

test('the demo sample holds no secret and no output, and stays small', async () => {
  const text = readFileSync(FILE, 'utf8')
  expect(text).not.toMatch(/sk_(test|live)_|whsec_|"output"/)
  expect(text.length).toBeLessThan(60_000)
})
