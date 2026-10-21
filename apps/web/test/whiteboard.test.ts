import { describe, expect, test } from 'vitest'
import type { ProjectMap } from '@sidecar/shared'
import { boardFrom, liveStepId, STATE_TEXT } from '../src/whiteboard'

const map: ProjectMap = {
  sections: [
    { kind: 'page', title: 'Pages and screens', items: [
      { id: 'page:page:', name: 'Home page', files: ['app/page.tsx'], stepIds: ['a', 'c'], state: 'changed' },
      { id: 'page:layout:', name: 'Site layout', files: ['app/layout.tsx'], stepIds: ['b'], state: 'seen' },
    ] },
    { kind: 'checks', title: 'Checks', items: [{ id: 'checks:x', name: 'Auth checks', files: ['lib/auth.test.ts'], stepIds: ['gone', 'd'], state: 'failed' }] },
  ],
}

describe('boardFrom', () => {
  const board = boardFrom(map, ['a', 'b', 'c', 'd'], 'c')
  test('keeps the map order and says each state in words', () => {
    expect(board.map((s) => s.title)).toEqual(['Pages and screens', 'Checks'])
    expect(board[0]!.items.map((i) => [i.name, i.stateText])).toEqual([['Home page', 'made or changed'], ['Site layout', 'looked at']])
    expect(board[1]!.items[0]!.stateText).toBe('needs a fix')
  })
  test('numbers steps the way the Stage does and drops steps the session no longer has', () => {
    expect(board[0]!.items[0]!.steps).toEqual([{ id: 'a', num: '001' }, { id: 'c', num: '003' }])
    expect(board[1]!.items[0]!.steps).toEqual([{ id: 'd', num: '004' }])
  })
  test('marks the part the newest step touched', () => {
    expect(board.flatMap((s) => s.items.filter((i) => i.live).map((i) => i.name))).toEqual(['Home page'])
    expect(boardFrom(map, ['a'], null).flatMap((s) => s.items).some((i) => i.live)).toBe(false)
  })
  test('a package Claude installed reads added', () => {
    const blocks: ProjectMap = { sections: [{ kind: 'blocks', title: 'Building blocks', items: [{ id: 'blocks:zod', name: 'zod', files: [], stepIds: [], state: 'changed' }] }] }
    expect(boardFrom(blocks, [], null)[0]!.items[0]!.stateText).toBe('added')
  })
  test('state words are plain', () => {
    for (const t of Object.values(STATE_TEXT)) expect(t).toMatch(/^[a-z ]+$/)
  })
})

describe('liveStepId', () => {
  const steps = [{ id: 'a', status: 'ok' as const }, { id: 'b', status: 'ok' as const }]
  const running = [{ id: 'a', status: 'ok' as const }, { id: 'b', status: 'running' as const }]
  test('the newest step is live while Claude is working', () => {
    expect(liveStepId(steps, 'working')).toBe('b')
  })
  test('a finished or idle session has no live part, even with a step left running', () => {
    for (const attention of ['done', 'idle'] as const) {
      expect(liveStepId(steps, attention)).toBeNull()
      expect(liveStepId(running, attention)).toBeNull()
    }
  })
  test('without a working attention, only a running newest step is live', () => {
    expect(liveStepId(steps, undefined)).toBeNull()
    expect(liveStepId(running, undefined)).toBe('b')
    expect(liveStepId(running, 'permission')).toBe('b')
    expect(liveStepId(steps, 'permission')).toBeNull()
  })
  test('no steps, no live part', () => {
    expect(liveStepId([], 'working')).toBeNull()
  })
})
