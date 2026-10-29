import { describe, expect, test } from 'vitest'
import { storyOf, type FeedStep } from '@sidecar/shared'
import { timelineOf } from '../src/timelineView'

let n = 0
const step = (toolName: string, category: FeedStep['category'], input: Record<string, unknown>, status: FeedStep['status'] = 'ok'): FeedStep => ({
  id: `t${++n}`, sessionId: 'x', toolName, category, status, input, startedAt: n, seq: n, caption: `c${n}`, techLabel: toolName,
  scene: { scene: 'thinking', cast: [], beats: [], caption: '' },
})
const prompt = (text: string) => step('UserPromptSubmit', 'prompt', { prompt: text })
const bash = (command: string, category: FeedStep['category'], status: FeedStep['status'] = 'ok') => step('Bash', category, { command }, status)

describe('timelineOf', () => {
  const steps = [prompt('add a cart'), bash('npm test', 'test', 'failed'), bash('npm test', 'test'), prompt('run it'), bash('npm run dev', 'run', 'interrupted'), bash('ls', 'fallback', 'running')]
  const t = timelineOf(steps, storyOf(steps))
  test('chapters cover every step once, in order', () => {
    expect(t.chapters.map((c) => [c.asked, c.from, c.to])).toEqual([['add a cart', 0, 2], ['run it', 3, 5]])
  })
  test('a failure later fixed is marked failed, its fix fixed', () => {
    expect(t.marks.map((m) => m.tone)).toEqual(['ok', 'failed', 'fixed', 'ok', 'stopped', 'running'])
  })
  test('marks keep their step index', () => expect(t.marks.map((m) => m.index)).toEqual([0, 1, 2, 3, 4, 5]))
})
