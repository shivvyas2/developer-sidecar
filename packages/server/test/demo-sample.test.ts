import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { projectMap, type FeedStep } from '@sidecar/shared'
import { runSession } from '../../../bench/explainer/run'
import { SESSIONS } from '../../../bench/explainer/sessions'

/**
 * The workstation's first-run demo plays the bench's build-stripe-app session. This builds it through
 * the real hooks, pipeline and rules, keeps only what the screen shows (no outputs, short inputs),
 * and checks the committed copy is current. Only DEMO_UPDATE=1 rewrites it, so a missing copy fails.
 */
const FILE = new URL('../../../apps/web/src/demo/sample.json', import.meta.url)
const SHORT = 160

const shorten = (v: unknown): unknown => {
  if (typeof v === 'string') return v.length > SHORT ? `${v.slice(0, SHORT)}…` : v
  if (Array.isArray(v)) return v.slice(0, 3).map(shorten)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shorten(x)]))
  return v
}

const CWD = '/Users/sam/shop'
const full = async () => (await runSession(SESSIONS.find((s) => s.name === 'build-stripe-app')!)).steps
const sample = (steps: FeedStep[]) => ({
  project: 'shop', cwd: CWD,
  steps: steps.map(({ output: _o, explanation: _e, ...s }) => ({ ...s, input: shorten(s.input) }) as FeedStep),
})

test('the demo sample is built from the bench session and is current', async () => {
  const want = `${JSON.stringify(sample(await full()), null, 1)}\n`
  if (process.env.DEMO_UPDATE === '1') writeFileSync(FILE, want)
  const fix = 'run DEMO_UPDATE=1 pnpm test to rebuild apps/web/src/demo/sample.json'
  expect(existsSync(FILE), fix).toBe(true)
  expect(readFileSync(FILE, 'utf8'), fix).toBe(want)
})

// the town and the Whiteboard read paths, commands and tables from the inputs, so shortening must keep all of them
test('shortening the inputs loses nothing the project map shows', async () => {
  const steps = await full()
  expect(projectMap(sample(steps).steps, CWD)).toEqual(projectMap(steps, CWD))
})

test('the demo sample holds no secret and no output, and stays small', async () => {
  const text = readFileSync(FILE, 'utf8')
  expect(text).not.toMatch(/sk_(test|live)_|whsec_|"output"/)
  expect(text.length).toBeLessThan(60_000)
})
