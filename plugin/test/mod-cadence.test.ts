import { describe, expect, test } from 'vitest'
import { due, interval, newCadence, QUIET_MS, recordPoll } from '../src/mod/cadence'
import { HELP, parseCommand } from '../src/mod/commands'

describe('cadence', () => {
  test('polls at once, then every second', () => {
    let c = newCadence(0)
    expect(due(c, 0)).toBe(true)
    c = recordPoll(c, 0, 'changed')
    expect(due(c, 999)).toBe(false)
    expect(due(c, 1000)).toBe(true)
  })
  test('backs off to five seconds after a quiet minute, and speeds up on change', () => {
    let c = recordPoll(newCadence(0), 0, 'changed')
    c = recordPoll(c, QUIET_MS, 'same')
    expect(interval(c, QUIET_MS)).toBe(5000)
    expect(due(c, QUIET_MS + 1000)).toBe(false)
    expect(due(c, QUIET_MS + 5000)).toBe(true)
    c = recordPoll(c, QUIET_MS + 5000, 'changed')
    expect(interval(c, QUIET_MS + 5000)).toBe(1000)
  })
  test('offline polls every five seconds and recovers', () => {
    let c = recordPoll(newCadence(0), 0, 'offline')
    expect(c.offline).toBe(true)
    expect(due(c, 4999)).toBe(false)
    expect(due(c, 5000)).toBe(true)
    c = recordPoll(c, 5000, 'same')
    expect(c.offline).toBe(false)
  })
})

describe('long offline', () => {
  test('after a minute offline, polls every thirty seconds', () => {
    let c = recordPoll(newCadence(0), 0, 'offline')
    expect(interval(c, 1000)).toBe(5000)
    c = recordPoll(c, 60_000, 'offline')
    expect(interval(c, 60_000)).toBe(30_000)
    expect(due(c, 85_000)).toBe(false)
    expect(due(c, 90_000)).toBe(true)
    c = recordPoll(c, 90_000, 'changed') // coming back online is a change: poll() records it so
    expect(c.offlineSince).toBeNull()
    expect(interval(c, 90_000)).toBe(1000)
  })
})

describe('/sidecar arguments', () => {
  test.each([
    ['', { kind: 'open' }],
    ['  ', { kind: 'open' }],
    ['web', { kind: 'web' }],
    ['WEB', { kind: 'web' }],
    ['off', { kind: 'mute', muted: true }],
    ['on', { kind: 'mute', muted: false }],
    ['bogus', { kind: 'help' }],
  ])('%j', (args, expected) => {
    expect(parseCommand(args)).toEqual(expected)
  })
  test('help names every form', () => {
    for (const form of ['/sidecar', '/sidecar web', '/sidecar off', '/sidecar on']) expect(HELP).toContain(form)
  })
})
