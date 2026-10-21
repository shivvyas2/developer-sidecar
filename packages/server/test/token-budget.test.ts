import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { isStopped, storyOf } from '@sidecar/shared'
import { RECAP_CAPS, RECAP_SYSTEM_PROMPT } from '../src/explainer/recap-prompt'
import { RECAP_MAX_TOKENS } from '../src/explainer/recap'
import { runSession, statsOf, turnsIn, type SessionRun } from '../../../bench/explainer/run'
import { EDGE_SESSIONS, SESSIONS, type BenchSession } from '../../../bench/explainer/sessions'

/**
 * Keeps model spend down on the bench's sample sessions (see bench/explainer). Users pay for every
 * call, through their Claude subscription (the claude command) or an API key. The step explainer this
 * replaced sent 9 requests, about 8,300 input and 3,700 output tokens on these sessions; a recap per
 * turn must stay well under that, and its size must not grow with the length of a turn.
 */
const MAX_CALLS = 5
const MAX_EST_INPUT = 5_000
const MAX_EST_OUTPUT = 1_500
/** Recaps must cost at most this share of what per-step explanations did. */
const MAX_SHARE_OF_PER_STEP = 0.65

const baseline = JSON.parse(readFileSync(new URL('../../../bench/explainer/baseline.json', import.meta.url), 'utf8')) as {
  perStep: { total: { estInputTokens: number; estOutputTokens: number } }
}

const runs: Array<{ s: BenchSession; run: SessionRun }> = []
for (const s of [...SESSIONS, ...EDGE_SESSIONS]) runs.push({ s, run: await runSession(s) })
const sample = runs.filter(({ s }) => SESSIONS.includes(s))

describe.each(runs.map(({ s, run }) => [s.name, s, run] as const))('%s', (_name, s, run) => {
  test('at most one call per turn that ended', () => expect(run.requests.length).toBeLessThanOrEqual(turnsIn(s)))
  test('every request is small: the short system prompt plus at most 4,500 characters', () => {
    for (const r of run.requests) {
      expect(r.system).toBe(RECAP_SYSTEM_PROMPT)
      expect(r.user.length).toBeLessThanOrEqual(RECAP_CAPS.userChars)
      expect(r.maxTokens).toBe(RECAP_MAX_TOKENS)
    }
  })
  test('no file body, original file or secret goes to the model', () => {
    for (const r of run.requests) {
      expect(r.user).not.toMatch(/originalFile|structuredPatch|sk_(test|live)_|whsec_/)
    }
  })
  test(`every failure in a recapped turn is sent, the latest ${RECAP_CAPS.failsWithTail} with the end of their output`, () => {
    for (const chapter of storyOf(run.steps)) {
      const failed = run.steps.filter((x) => chapter.stepIds.includes(x.id) && x.status === 'failed' && !isStopped(x))
      for (const [i, st] of failed.entries()) {
        const command = String((st.input as { command?: unknown }).command ?? '')
        if (command) expect(run.requests.some((r) => r.user.includes(`${command.slice(0, 60)}`)), `${st.caption} was not sent`).toBe(true)
        if (i < failed.length - RECAP_CAPS.failsWithTail || typeof st.output !== 'string') continue
        // the encoder writes each step on one line, so whitespace is collapsed
        const end = st.output.replace(/\s+/g, ' ').trim().slice(-40)
        expect(run.requests.some((r) => r.user.includes(end)), `${st.caption} was sent without its output`).toBe(true)
      }
    }
  })
})

test('the sample sessions stay under the token budget, well below per-step explanations', () => {
  const total = sample.map(({ s, run }) => statsOf(run, turnsIn(s))).reduce((a, x) => ({
    calls: a.calls + x.calls, input: a.input + x.estInputTokens, output: a.output + x.estOutputTokens,
  }), { calls: 0, input: 0, output: 0 })
  expect(total.calls).toBeLessThanOrEqual(MAX_CALLS)
  expect(total.input).toBeLessThanOrEqual(MAX_EST_INPUT)
  expect(total.output).toBeLessThanOrEqual(MAX_EST_OUTPUT)
  expect(total.input + total.output).toBeLessThan(MAX_SHARE_OF_PER_STEP * (baseline.perStep.total.estInputTokens + baseline.perStep.total.estOutputTokens))
})

test('the recap system prompt stays short (it goes with every request)', () => {
  expect(RECAP_SYSTEM_PROMPT.length).toBeLessThanOrEqual(1200)
})

describe('edge cases', () => {
  const edge = runs.find(({ s }) => s.name === 'edge-cases')!.run
  const long = runs.find(({ s }) => s.name === 'long-turn')!.run
  test('a long turn with five failures is one request over the length cap, so the guards above are tested on it', () => {
    expect(long.requests).toHaveLength(1)
    expect(long.steps.filter((x) => x.status === 'failed')).toHaveLength(5)
    expect(long.requests[0]!.user).toMatch(/…and \d+ more steps/)
    expect(long.requests[0]!.user.length).toBeGreaterThan(RECAP_CAPS.userChars - 300)
  })
  test('the turn is recapped once, and the cancelled dev server says it was stopped', () => {
    expect(edge.requests).toHaveLength(1)
    expect(edge.requests[0]!.user).toMatch(/ran `npm run dev` \(stopped\)/)
  })
  test('reading secrets through the shell is described, and the key never reaches the model', () => {
    expect(edge.requests[0]!.user).toMatch(/secret settings|\.env\.local/i)
    expect(edge.requests[0]!.user).not.toMatch(/sk_test_51P/)
  })
})
