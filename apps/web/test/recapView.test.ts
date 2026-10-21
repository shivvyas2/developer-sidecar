import { describe, expect, test } from 'vitest'
import type { RuleRecap } from '@sidecar/shared'
import { cardAsks, isStale, MAX_PARTS, recapAsk, recapText } from '../src/recapView'

const base: RuleRecap = { turnId: 'p', asked: 'Add checkout', state: 'done', outcome: 'good', built: [], packages: 0, changed: false, checks: 'none', fixes: 0 }
let n = 0
const part = (name: string, failed = false) => ({ id: `page:${++n}`, kind: 'page' as const, name, failed })

describe('recapText', () => {
  test('the kicker follows what Claude is doing', () => {
    expect(recapText(base).kicker).toBe('WHERE THINGS STAND')
    expect(recapText({ ...base, state: 'working', outcome: 'working' }).kicker).toBe('SO FAR')
    expect(recapText({ ...base, state: 'you' })).toMatchObject({ kicker: 'CLAUDE NEEDS YOU', headline: 'Claude is waiting for your answer in Claude Code.' })
  })
  test('the headline says how it ended', () => {
    expect(recapText({ ...base, built: [part('Home page')] }).headline).toBe('Done.')
    expect(recapText(base).headline).toBe('Done. Nothing was changed.')
    // README.md and package.json are not parts of the map, but editing them is still a change
    expect(recapText({ ...base, changed: true }).headline).toBe('Done.')
    expect(recapText({ ...base, outcome: 'fixed', fixes: 2 }).headline).toBe('Done, after fixing 2 problems.')
    expect(recapText({ ...base, outcome: 'failing' }).headline).toBe('Something still needs a fix.')
    expect(recapText({ ...base, outcome: 'stopped' }).headline).toBe('Stopped before finishing.')
  })
  test('parts are capped with a count of the rest; packages and checks in words', () => {
    const built = Array.from({ length: MAX_PARTS + 3 }, (_, i) => part(`Part ${i}`, i === 0))
    const t = recapText({ ...base, built, packages: 1, checks: 'fail' })
    expect(t.parts).toHaveLength(MAX_PARTS)
    expect(t.parts[0]).toMatchObject({ name: 'Part 0', failed: true })
    expect(t.more).toBe(3)
    expect(t.packages).toBe('Added 1 building block')
    expect(t.checks).toBe('Checks fail')
    expect(recapText({ ...base, packages: 4, checks: 'pass' })).toMatchObject({ packages: 'Added 4 building blocks', checks: 'Checks pass' })
  })
  test('the address is shown without its scheme, http or https', () => {
    expect(recapText(base).address).toBeNull()
    expect(recapText({ ...base, url: 'http://localhost:3000' }).address).toBe('localhost:3000')
    expect(recapText({ ...base, url: 'https://localhost:3000/app' }).address).toBe('localhost:3000/app')
  })
  test('parts keep their map ids, so two parts with the same name stay apart', () => {
    const t = recapText({ ...base, built: [part('Shop page'), part('Shop page')] })
    expect(t.parts.map((p) => p.name)).toEqual(['Shop page', 'Shop page'])
    expect(new Set(t.parts.map((p) => p.id)).size).toBe(2)
  })
  test('the pulled card leaves the ask to the recap when it shows the same failed step', () => {
    const failing = { ...base, outcome: 'failing' as const, failingId: 's9' }
    expect(cardAsks('s9', failing)).toBe(false)
    expect(cardAsks('s3', failing)).toBe(true)
    // no recap on screen (a replay or an older pick): the card keeps its own ask
    expect(cardAsks('s9', null)).toBe(true)
  })
})

describe('recapAsk', () => {
  const entry = (status: 'pending' | 'done' | 'unavailable', next?: string) =>
    ({ sessionId: 's', turnId: 'p', lastStepId: 'x', at: 1, status, ...(status === 'done' ? { ai: { summary: 's', meaning: 'm', ...(next ? { next } : {}) } } : {}) })
  test('nothing failing, no ask, whatever the recap says', () => expect(recapAsk(entry('done', 'Fix it'), null)).toBeNull())
  test('the AI recap’s ask wins once it is written', () => expect(recapAsk(entry('done', 'Fix the total'), 'The last step failed')).toBe('Fix the total'))
  test('otherwise the rule-based ask', () => {
    expect(recapAsk(undefined, 'The last step failed')).toBe('The last step failed')
    expect(recapAsk(entry('pending'), 'The last step failed')).toBe('The last step failed')
    expect(recapAsk(entry('done'), 'The last step failed')).toBe('The last step failed')
  })
  test('a recap written before Claude went on is stale, and its old ask is not offered', () => {
    // the entry covers the turn up to step x
    expect(isStale(entry('done', 'Fix the total'), 'x')).toBe(false)
    expect(isStale(entry('done', 'Fix the total'), 'y')).toBe(true)
    expect(isStale(entry('pending'), 'y')).toBe(false)
    expect(isStale(undefined, 'y')).toBe(false)
    expect(recapAsk(entry('done', 'Fix the total'), 'The last step failed', 'y')).toBe('The last step failed')
    expect(recapAsk(entry('done', 'Fix the total'), 'The last step failed', 'x')).toBe('Fix the total')
  })
})
