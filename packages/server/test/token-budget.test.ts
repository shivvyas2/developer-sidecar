import { describe, expect, test } from 'vitest'
import { routineIds } from '@sidecar/shared'
import { SYSTEM_PROMPT } from '../src/explainer/prompt'
import { runSession, statsOf, type SessionRun } from '../../../bench/explainer/run'
import { EDGE_SESSIONS, SESSIONS } from '../../../bench/explainer/sessions'

/**
 * Keeps the explainer lean on the bench's sample sessions (see bench/explainer). Before routine steps were
 * skipped and requests trimmed, these sessions sent 79 steps whose lines came to 78,857 characters. The
 * ceilings leave about 20% headroom over today, so a change that puts bulk back fails here. Step lines are
 * measured apart from the system prompt, which is checked once: summed per request, it would dominate.
 */
const MAX_SENT = 36
const MAX_STEP_CHARS = 19_500
const MAX_SYSTEM_PROMPT_CHARS = 1_800

const runs: SessionRun[] = []
for (const s of SESSIONS) runs.push(await runSession(s))
const edges: SessionRun[] = []
for (const s of EDGE_SESSIONS) edges.push(await runSession(s))

interface Sent { tool: string; input: Record<string, unknown>; output?: unknown }
const sentSteps = (r: SessionRun['requests'][number]) =>
  r.user.split('\n').filter((l) => l.startsWith('{"stepId"')).map((l) => JSON.parse(l) as Sent)
const lines = (run: SessionRun) => run.requests.flatMap(sentSteps)

describe.each([...runs, ...edges].map((r) => [r.name, r] as const))('%s', (_name, run) => {
  test('no routine step is sent', () => {
    const routine = routineIds(run.steps)
    expect(routine.size).toBeGreaterThan(0)
    expect(run.sent.filter((id) => routine.has(id))).toEqual([])
  })

  test('every failed step is sent with something that says why', () => {
    for (const s of run.steps.filter((x) => x.status === 'failed')) {
      const i = run.batches.findIndex((b) => b.includes(s.id))
      expect(i, `${s.caption} was not sent`).toBeGreaterThanOrEqual(0)
      const sent = sentSteps(run.requests[i]!)[run.batches[i]!.indexOf(s.id)]!
      expect(sent.output, `${s.caption} was sent without output`).toBeDefined()
      if (typeof s.output === 'string') expect(sent.output).toContain(s.output.slice(0, 40))
    }
  })

  test('no whole file goes to the model', () => {
    for (const r of run.requests) expect(r.user).not.toContain('originalFile')
    for (const l of lines(run).filter((x) => x.tool === 'Write')) {
      const c = l.input.content
      expect(typeof c === 'string' ? c.length : (c as { preview: string }).preview.length).toBeLessThanOrEqual(401)
    }
  })
})

test('the sample sessions stay under the token budget', () => {
  const total = runs.map(statsOf).reduce((a, s) => ({ sent: a.sent + s.sent, chars: a.chars + s.stepChars }), { sent: 0, chars: 0 })
  expect(total.sent).toBeLessThanOrEqual(MAX_SENT)
  expect(total.chars).toBeLessThanOrEqual(MAX_STEP_CHARS)
})

test('the system prompt stays short (it is sent with every request)', () => {
  expect(SYSTEM_PROMPT.length).toBeLessThanOrEqual(MAX_SYSTEM_PROMPT_CHARS)
})

describe('edge cases', () => {
  const edge = edges[0]!
  const byCaption = (re: RegExp) => edge.steps.find((s) => re.test(s.caption))!
  test('a multi-line command is explained, not skipped as a look', () => {
    expect(edge.sent).toContain(edge.steps.find((s) => String((s.input as { command?: string }).command).startsWith('ls dist'))!.id)
  })
  test('a cancelled command is sent as failed and says it was interrupted', () => {
    const run = byCaption(/starting your app/i)
    expect(run.status).toBe('failed')
    expect(edge.sent).toContain(run.id)
    const i = edge.batches.findIndex((b) => b.includes(run.id))
    expect(sentSteps(edge.requests[i]!)[edge.batches[i]!.indexOf(run.id)]!.output).toEqual({ interrupted: true })
  })
  test('reading secrets through the shell is explained, and the key never reaches the model', () => {
    expect(edge.sent).toContain(byCaption(/secret settings/i).id)
    for (const r of edge.requests) expect(r.user).not.toMatch(/sk_test_51P/)
  })
})
