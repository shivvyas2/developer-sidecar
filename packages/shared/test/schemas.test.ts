import { describe, expect, test } from 'vitest'
import { SceneSpecSchema, SidecarEventSchema } from '@sidecar/shared'

describe('SidecarEventSchema', () => {
  test('accepts a tool_start event', () => {
    const r = SidecarEventSchema.safeParse({
      id: 'e1', sessionId: 's1', ts: 1, cwd: '/p', kind: 'tool_start',
      tool: { name: 'Bash', useId: 'tu1', input: { command: 'ls' } },
    })
    expect(r.success).toBe(true)
  })
  test('rejects an unknown kind', () => {
    const r = SidecarEventSchema.safeParse({ id: 'e1', sessionId: 's1', ts: 1, cwd: '/p', kind: 'nope' })
    expect(r.success).toBe(false)
  })
})

describe('SceneSpecSchema', () => {
  test('accepts the spec example', () => {
    const r = SceneSpecSchema.safeParse({
      scene: 'connect-service',
      cast: ['claude', { place: 'service', label: 'Stripe' }],
      beats: [
        { actor: 'claude', do: 'walkTo', to: 'service' },
        { actor: 'claude', do: 'plugCable', to: 'service' },
        { fx: 'sparkle', at: 'service' },
      ],
      caption: 'Connecting your app to Stripe for payments',
    })
    expect(r.success).toBe(true)
  })
  test('rejects an unknown action', () => {
    const r = SceneSpecSchema.safeParse({ scene: 'x', cast: [], beats: [{ actor: 'claude', do: 'fly' }], caption: '' })
    expect(r.success).toBe(false)
  })
})
