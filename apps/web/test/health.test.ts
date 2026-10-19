import { describe, expect, test } from 'vitest'
import type { FeedStep } from '@sidecar/shared'
import { checksOf, HEALTH_WORD, healthOf } from '../src/health'

type S = Pick<FeedStep, 'category' | 'status'>
const s = (category: S['category'], status: S['status'] = 'ok'): S => ({ category, status })

describe('checksOf', () => {
  test('none before any check run', () => expect(checksOf([s('prompt'), s('create')])).toBe('none'))
  test('the last finished run decides', () => {
    expect(checksOf([s('test', 'failed'), s('edit'), s('test')])).toBe('pass')
    expect(checksOf([s('test'), s('edit'), s('test', 'failed')])).toBe('fail')
  })
  test('a run still going, or cut short, does not count', () => {
    expect(checksOf([s('test', 'failed'), s('test', 'running')])).toBe('fail')
    expect(checksOf([s('test'), s('test', 'interrupted')])).toBe('pass')
  })
})

describe('healthOf', () => {
  test('waiting for permission beats everything', () => expect(healthOf([s('test', 'failed')], 'permission')).toBe('you'))
  test('failed checks need a fix until a later run passes', () => {
    expect(healthOf([s('test', 'failed'), s('edit')])).toBe('fix')
    expect(healthOf([s('test', 'failed'), s('edit'), s('test')])).toBe('ok')
  })
  test('a failed change needs a fix; a later change that worked clears it', () => {
    expect(healthOf([s('install', 'failed'), s('read')])).toBe('fix')
    expect(healthOf([s('install', 'failed'), s('install')])).toBe('ok')
  })
  test('reads, prompts, running and interrupted steps say nothing', () => {
    expect(healthOf([s('edit', 'failed'), s('read', 'failed'), s('prompt'), s('run', 'interrupted'), s('test', 'running')])).toBe('fix')
  })
  test('working while Claude works, all good once it stops', () => {
    expect(healthOf([s('create')], 'working')).toBe('working')
    expect(healthOf([s('create')], 'done')).toBe('ok')
    expect(healthOf([], 'idle')).toBe('ok')
    expect(healthOf([])).toBe('ok')
  })
  test('every state has a word that fits the frame', () => {
    for (const w of Object.values(HEALTH_WORD)) expect(w.length).toBeLessThanOrEqual(12)
  })
})
