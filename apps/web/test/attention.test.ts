import { describe, expect, test } from 'vitest'
import type { SessionSummary } from '@sidecar/shared'
import { healthOf, needsYou } from '@sidecar/ui-kit'
import { attentionNotice, catchesUp, liveTag, sessionMark, TITLE, titleFor } from '../src/attention'

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({ id: 's1', cwd: '/shop', startedAt: 0, lastAt: 1, ...over })

describe('attention', () => {
  test('a permission prompt names what Claude asked and where to answer', () => {
    expect(attentionNotice(session({ attention: 'permission', attentionText: 'Claude needs your permission to use Bash' })))
      .toEqual({ tag: 'NEEDS YOU', text: 'Claude needs your permission to use Bash. Answer in your Claude Code window.' })
    expect(attentionNotice(session({ attention: 'permission' }))?.text)
      .toBe('Claude is waiting for your permission. Answer in your Claude Code window.')
  })
  test('idle asks for the next message; working, done and no session show nothing', () => {
    expect(attentionNotice(session({ attention: 'idle' }))?.tag).toBe('YOUR TURN')
    expect(attentionNotice(session({ attention: 'working' }))).toBeNull()
    expect(attentionNotice(session({ attention: 'done' }))).toBeNull()
    expect(attentionNotice(null)).toBeNull()
  })
  test('the stage tag: offline first, then needs you, then done', () => {
    expect(liveTag(session({ attention: 'permission' }), true)).toBe('OFFLINE')
    expect(liveTag(session({ attention: 'idle' }), false)).toBe('NEEDS YOU')
    expect(liveTag(session({ attention: 'done' }), false)).toBe('DONE')
    expect(liveTag(session({ attention: 'working' }), false)).toBeUndefined()
  })
  test('the strip, the tag and the status light agree on who is waiting', () => {
    for (const attention of ['permission', 'idle', 'working', 'done'] as const) {
      const s = session({ attention })
      expect(liveTag(s, false) === 'NEEDS YOU', attention).toBe(needsYou(attention))
      expect(healthOf([], attention) === 'you', attention).toBe(needsYou(attention))
      expect(sessionMark(s) !== '', attention).toBe(needsYou(attention))
    }
  })
  test('the stage catches up when Claude stops or waits, whatever the tag says', () => {
    expect((['done', 'permission', 'idle', 'working', undefined] as const).map(catchesUp)).toEqual([true, true, true, false, false])
  })
  test('the tab title and picker mark flag any waiting session', () => {
    expect(titleFor([session(), session({ id: 's2', attention: 'permission' })])).toBe(`(waiting) ${TITLE}`)
    expect(titleFor([session({ attention: 'done' })])).toBe(TITLE)
    expect(sessionMark(session({ attention: 'idle' }))).toBe(' · NEEDS YOU')
    expect(sessionMark(session())).toBe('')
  })
})
