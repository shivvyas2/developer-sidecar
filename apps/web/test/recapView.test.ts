import { describe, expect, test } from 'vitest'
import type { RuleRecap } from '@sidecar/shared'
import { MAX_PARTS, recapText } from '../src/recapView'

const base: RuleRecap = { turnId: 'p', asked: 'Add checkout', state: 'done', outcome: 'good', built: [], packages: 0, checks: 'none', fixes: 0 }
const part = (name: string, failed = false) => ({ kind: 'page' as const, name, failed })

describe('recapText', () => {
  test('the kicker follows what Claude is doing', () => {
    expect(recapText(base).kicker).toBe('WHERE THINGS STAND')
    expect(recapText({ ...base, state: 'working', outcome: 'working' }).kicker).toBe('SO FAR')
    expect(recapText({ ...base, state: 'you' })).toMatchObject({ kicker: 'CLAUDE NEEDS YOU', headline: 'Claude is waiting for your answer in Claude Code.' })
  })
  test('the headline says how it ended', () => {
    expect(recapText({ ...base, built: [part('Home page')] }).headline).toBe('Done.')
    expect(recapText(base).headline).toBe('Done. Nothing was changed.')
    expect(recapText({ ...base, outcome: 'fixed', fixes: 2 }).headline).toBe('Done, after fixing 2 problems.')
    expect(recapText({ ...base, outcome: 'failing' }).headline).toBe('Something still needs a fix.')
    expect(recapText({ ...base, outcome: 'stopped' }).headline).toBe('Stopped before finishing.')
  })
  test('parts are capped with a count of the rest; packages and checks in words', () => {
    const built = Array.from({ length: MAX_PARTS + 3 }, (_, i) => part(`Part ${i}`, i === 0))
    const t = recapText({ ...base, built, packages: 1, checks: 'fail' })
    expect(t.parts).toHaveLength(MAX_PARTS)
    expect(t.parts[0]).toEqual({ name: 'Part 0', failed: true })
    expect(t.more).toBe(3)
    expect(t.packages).toBe('Added 1 building block')
    expect(t.checks).toBe('Checks fail')
    expect(recapText({ ...base, packages: 4, checks: 'pass' })).toMatchObject({ packages: 'Added 4 building blocks', checks: 'Checks pass' })
  })
})
