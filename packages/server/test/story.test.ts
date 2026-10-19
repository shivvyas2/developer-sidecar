import { describe, expect, test } from 'vitest'
import { beatIds, storyOf } from '@sidecar/shared'
import { runSession } from '../../../bench/explainer/run'
import { SESSIONS } from '../../../bench/explainer/sessions'

// The bench's sample sessions, through the real hooks, pipeline and rules, then told as a story.
const storyFor = async (name: string) => storyOf((await runSession(SESSIONS.find((s) => s.name === name)!)).steps)
const shape = (c: ReturnType<typeof storyOf>[number]) =>
  c.beats.map((b) => (b.type === 'step' ? (b.fixes ? 'fix' : b.fixedBy ? 'problem' : b.phase) : `${b.type}×${b.ids.length}`))

describe('the sample sessions as a story', () => {
  test('the repair loop is one chapter with one problem, fixed', async () => {
    const [c, ...rest] = await storyFor('fix-failing-test')
    expect(rest).toEqual([])
    expect(c!.asked).toMatch(/^The auth tests are failing/)
    expect(c!.fixes).toBe(1)
    expect(c!.outcome).toBe('fixed')
    // failing run; read, read, grep; a failed edit; a read; two edits; failing again; a read; two edits;
    // the passing run that fixes both; two edits to the test; the full run; tsc; git diff; the commit
    expect(shape(c!)).toEqual([
      'problem', 'looked×3', 'building', 'looking', 'edits×2', 'problem', 'looking', 'edits×2', 'fix',
      'edits×2', 'checking', 'other', 'looking', 'saving',
    ])
  })

  test('building checkout is two chapters: a fixed failing test, then the orders work', async () => {
    const story = await storyFor('build-stripe-app')
    expect(story.map((c) => [c.asked.slice(0, 22), c.fixes, c.outcome])).toEqual([
      ['Add Stripe checkout so', 1, 'fixed'],
      ['Store each order in Po', 0, 'good'],
    ])
  })

  test('exploring folds about twenty looks into a handful of beats', async () => {
    const story = await storyFor('explore-codebase')
    const looks = story[0]!.beats.filter((b) => b.phase === 'looking')
    expect(story[0]!.stepIds.length).toBeGreaterThanOrEqual(20)
    expect(looks.length).toBeLessThanOrEqual(6)
    expect(story[1]!.outcome).toBe('good')
  })

  test('every step of every session is in exactly one beat', async () => {
    for (const s of SESSIONS) {
      const run = await runSession(s)
      const all = storyOf(run.steps).flatMap((c) => [...(c.promptId ? [c.promptId] : []), ...c.beats.flatMap(beatIds)])
      expect(all).toEqual(run.steps.map((x) => x.id))
    }
  })
})
