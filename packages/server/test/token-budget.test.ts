import { describe, expect, test } from 'vitest'
import { routineIds } from '@sidecar/shared'
import { runSession, statsOf, type SessionRun } from '../../../bench/explainer/run'
import { SESSIONS } from '../../../bench/explainer/sessions'

/**
 * Keeps the explainer lean on the bench's sample sessions (see bench/explainer). Before routine steps were
 * skipped and requests trimmed, these sessions sent 79 steps in 97,425 request characters; the ceilings
 * leave about 20% headroom over what they send now, so a change that puts bulk back fails here.
 */
const MAX_SENT = 35
const MAX_REQUEST_CHARS = 36_000

const runs: SessionRun[] = []
for (const s of SESSIONS) runs.push(await runSession(s))

const lines = (run: SessionRun) => run.requests.flatMap((r) =>
  r.user.split('\n').filter((l) => l.startsWith('{"stepId"')).map((l) => JSON.parse(l) as { tool: string; input: Record<string, unknown> }))

describe.each(runs.map((r) => [r.name, r] as const))('%s', (_name, run) => {
  test('no routine step is sent', () => {
    const routine = routineIds(run.steps)
    expect(routine.size).toBeGreaterThan(0)
    expect(run.sent.filter((id) => routine.has(id))).toEqual([])
  })

  test('every failed step is sent with the start of its error', () => {
    for (const s of run.steps.filter((x) => x.status === 'failed')) {
      const i = run.batches.findIndex((b) => b.includes(s.id))
      expect(i, `${s.caption} was not sent`).toBeGreaterThanOrEqual(0)
      const head = JSON.stringify(String(s.output).slice(0, 40)).slice(1, -1)
      expect(run.requests[i]!.user).toContain(head)
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
  const total = runs.map(statsOf).reduce((a, s) => ({ sent: a.sent + s.sent, chars: a.chars + s.requestChars }), { sent: 0, chars: 0 })
  expect(total.sent).toBeLessThanOrEqual(MAX_SENT)
  expect(total.chars).toBeLessThanOrEqual(MAX_REQUEST_CHARS)
})
