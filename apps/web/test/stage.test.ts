import { describe, expect, test } from 'vitest'
import { initialStage, MAX_BACKLOG, replayAdvance, stageReducer, type StageAction, type StageState } from '../src/stage'

const run = (actions: StageAction[], from: StageState = initialStage) => actions.reduce(stageReducer, from)
const ids = (n: number, prefix = 's') => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

describe('stageReducer', () => {
  test('reset shows the latest step as a still and queues nothing', () => {
    const s = run([{ type: 'reset', ids: ['a', 'b'] }])
    expect(s).toMatchObject({ current: 'b', queue: [], playing: false })
  })
  test('a new step plays at once when the stage is idle', () => {
    const s = run([{ type: 'reset', ids: ['a'] }, { type: 'sync', ids: ['a', 'b'] }])
    expect(s).toMatchObject({ current: 'b', queue: [], playing: true })
  })
  test('steps arriving mid-scene queue up and play in order', () => {
    let s = run([{ type: 'reset', ids: [] }, { type: 'sync', ids: ['a'] }, { type: 'sync', ids: ['a', 'b', 'c'] }])
    expect(s).toMatchObject({ current: 'a', queue: ['b', 'c'] })
    s = run([{ type: 'done' }], s)
    expect(s).toMatchObject({ current: 'b', queue: ['c'], playing: true })
    s = run([{ type: 'done' }, { type: 'done' }], s)
    expect(s).toMatchObject({ current: 'c', queue: [], playing: false })
  })
  test('a burst never leaves more than MAX_BACKLOG queued; the newest survive (Review Focus 2)', () => {
    const s = run([{ type: 'reset', ids: [] }, { type: 'sync', ids: ['first'] }, { type: 'sync', ids: ['first', ...ids(50)] }])
    expect(s.current).toBe('first')
    expect(s.queue).toEqual(ids(50).slice(-MAX_BACKLOG))
  })
  test('re-syncing known ids (status updates, snapshot merges) changes nothing (Review Focus 5)', () => {
    const s = run([{ type: 'reset', ids: ['a'] }, { type: 'sync', ids: ['a', 'b'] }])
    expect(run([{ type: 'sync', ids: ['a', 'b'] }], s)).toBe(s)
  })
  test('reset after a session switch drops the old backlog (Review Focus 5)', () => {
    const s = run([{ type: 'reset', ids: [] }, { type: 'sync', ids: ids(3) }, { type: 'reset', ids: ['x'] }])
    expect(s).toMatchObject({ current: 'x', queue: [], playing: false })
  })
  test('done with an empty queue keeps the current scene as a still', () => {
    const s = run([{ type: 'reset', ids: [] }, { type: 'sync', ids: ['a'] }, { type: 'done' }])
    expect(s).toMatchObject({ current: 'a', playing: false })
  })
})

test('replayAdvance steps forward and stops at the end', () => {
  expect(replayAdvance({ index: 0, playing: true }, 3)).toEqual({ index: 1, playing: true })
  expect(replayAdvance({ index: 2, playing: true }, 3)).toEqual({ index: 2, playing: false })
})
