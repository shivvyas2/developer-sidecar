import { describe, expect, test } from 'vitest'
import type { Chapter, FeedStep, StoryBeat } from '@sidecar/shared'
import { beatTitle, chapterLine, drawerRows, foldedBeatOf, OUTCOME_TEXT } from '../src/storyView'

type Seen = Pick<FeedStep, 'id' | 'toolName' | 'input'>
const seen = (id: string, toolName: string, file?: string): Seen => ({ id, toolName, input: file ? { file_path: file } : { pattern: 'x' } })

describe('chapterLine', () => {
  test('counts steps and fixes and says how it ended', () => {
    expect(chapterLine({ stepIds: ['a'], fixes: 0, outcome: 'good' })).toBe('1 step · done')
    expect(chapterLine({ stepIds: ['a', 'b', 'c'], fixes: 1, outcome: 'fixed' })).toBe('3 steps · fixed 1 problem · done, after a fix')
    expect(chapterLine({ stepIds: [], fixes: 2, outcome: 'working' })).toBe('0 steps · fixed 2 problems · working on it')
  })
  test('outcome words are plain', () => {
    for (const t of Object.values(OUTCOME_TEXT)) expect(t).toMatch(/^[a-z ,]+$/)
  })
})

describe('beatTitle', () => {
  const byId = new Map([seen('r1', 'Read', '/p/a.ts'), seen('r2', 'Read', '/p/b.ts'), seen('r3', 'Read', '/p/a.ts'), seen('g1', 'Grep'), seen('g2', 'Glob'), seen('g3', 'Grep')].map((s) => [s.id, s]))
  test('reads count distinct files; searches are counted in words', () => {
    expect(beatTitle({ type: 'looked', ids: ['r1', 'r2', 'r3'], phase: 'looking' }, byId)).toBe('Read 2 files')
    expect(beatTitle({ type: 'looked', ids: ['r1', 'g1'], phase: 'looking' }, byId)).toBe('Read 1 file, searched once')
    expect(beatTitle({ type: 'looked', ids: ['g1', 'g2'], phase: 'looking' }, byId)).toBe('Searched twice')
    expect(beatTitle({ type: 'looked', ids: ['g1', 'g2', 'g3'], phase: 'looking' }, byId)).toBe('Searched 3 times')
    expect(beatTitle({ type: 'looked', ids: ['missing', 'gone'], phase: 'looking' }, new Map())).toBe('Looked around twice')
  })
  test('only Grep and Glob are searches; a look from the shell (git status, cat, ls) is looking around', () => {
    const bash = (id: string, command: string): Seen => ({ id, toolName: 'Bash', input: { command } })
    const shell = new Map([...byId, ...[bash('b1', 'git status'), bash('b2', 'git diff'), bash('b3', 'cat README.md'), bash('b4', 'ls')].map((x) => [x.id, x] as const)])
    expect(beatTitle({ type: 'looked', ids: ['b1', 'b2', 'b3'], phase: 'looking' }, shell)).toBe('Looked around 3 times')
    expect(beatTitle({ type: 'looked', ids: ['b4', 'r1', 'r2', 'g1', 'g2'], phase: 'looking' }, shell)).toBe('Read 2 files, searched twice, looked around once')
  })
  test('repeat changes name the file', () => {
    expect(beatTitle({ type: 'edits', ids: ['e1', 'e2', 'e3'], file: '/p/app/api/route.ts', phase: 'building' }, byId)).toBe('Changed route.ts 3 times')
  })
})

describe('drawerRows', () => {
  const beats: StoryBeat[] = [
    { type: 'looked', ids: ['a', 'b'], phase: 'looking' },
    { type: 'step', id: 'c', phase: 'building' },
    { type: 'step', id: 'd', phase: 'building' },
    { type: 'step', id: 'e', phase: 'checking' },
  ]
  test('newest first, with a phase title above each run', () => {
    expect(drawerRows({ id: 'p', beats }).map((r) => (r.type === 'phase' ? r.title : r.key))).toEqual([
      'Checking', 'p:e', 'Building', 'p:d', 'p:c', 'Looking around', 'p:a',
    ])
  })
  test('keys are unique', () => {
    const keys = drawerRows({ id: 'p', beats }).map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

test('foldedBeatOf finds the folded beat holding a step, and nothing for a single step', () => {
  const chapters = [{ id: 'p', beats: [{ type: 'looked', ids: ['a', 'b'], phase: 'looking' }, { type: 'step', id: 'c', phase: 'building' }] }] as unknown as Chapter[]
  expect(foldedBeatOf(chapters, 'b')).toBe('p:a')
  expect(foldedBeatOf(chapters, 'c')).toBeNull()
  expect(foldedBeatOf(chapters, null)).toBeNull()
})
