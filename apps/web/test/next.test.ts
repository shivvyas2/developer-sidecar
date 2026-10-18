import { describe, expect, test } from 'vitest'
import type { FeedStep } from '@sidecar/shared'
import { nextAsk, UNDO_HINT } from '../src/next'

const step = (over: Partial<FeedStep> = {}): FeedStep => ({
  id: 'x', sessionId: 's1', toolName: 'Bash', input: {}, startedAt: 1, status: 'failed', seq: 1,
  category: 'test', caption: 'Checking the code works: some checks failed', techLabel: 'Bash: npm test',
  scene: { scene: 'thinking', cast: [], beats: [], caption: 'c' }, ...over,
})
const explained = { plain: 'p', why: 'w', concept: null, decision: null }

describe('nextAsk', () => {
  test('only failed steps get a next step', () => {
    expect(nextAsk(step({ status: 'ok' }), { ...explained, next: 'x' })).toBeNull()
    expect(nextAsk(step({ status: 'interrupted' }), undefined)).toBeNull()
  })
  test('uses the explainer suggestion when there is one', () => {
    expect(nextAsk(step(), { ...explained, next: 'Fix the failing checkout test.' })).toBe('Fix the failing checkout test.')
  })
  test('falls back to a request naming the step, clipped', () => {
    expect(nextAsk(step(), undefined)).toBe('The last step failed (Bash: npm test). Find out why and fix it.')
    expect(nextAsk(step(), { unavailable: 'off' })).toContain('Bash: npm test')
    expect(nextAsk(step({ techLabel: 'Bash: ' + 'a'.repeat(300) }), undefined)!.length).toBeLessThan(140)
  })
  test('the undo hint names Claude Code’s own commands', () => {
    expect(UNDO_HINT).toMatch(/Esc twice/)
    expect(UNDO_HINT).toMatch(/\/rewind/)
  })
})
