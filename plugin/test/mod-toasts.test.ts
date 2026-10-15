import { expect, test } from 'vitest'
import type { FeedStep } from '@sidecar/shared'
import { freshMemory, milestones, vendorOf } from '../src/mod/toasts'

const step = (n: number, category: FeedStep['category'], status: FeedStep['status'], vendor?: string): FeedStep => ({
  id: `s${n}`, sessionId: 'S1', seq: n, toolName: 'Bash', input: {}, startedAt: n, status, category,
  caption: 'c', techLabel: 'Bash: x',
  scene: { scene: 'connect-service', cast: ['claude', vendor ? { place: 'service', label: vendor } : { place: 'service' }], beats: [], caption: 'c' },
} as FeedStep)

test('the first call only remembers: no toasts for history', () => {
  const mem = freshMemory()
  expect(milestones([step(1, 'test', 'failed'), step(2, 'deploy', 'ok')], mem)).toEqual([])
  expect(milestones([step(1, 'test', 'failed'), step(2, 'deploy', 'ok')], mem)).toEqual([])
})

test('failed tests, a pass after a failure, and a deploy', () => {
  const mem = freshMemory()
  milestones([], mem)
  expect(milestones([step(1, 'test', 'failed')], mem)).toEqual(['✕ TESTS FAILED · 001'])
  expect(milestones([step(1, 'test', 'failed'), step(2, 'test', 'running')], mem)).toEqual([])
  expect(milestones([step(1, 'test', 'failed'), step(2, 'test', 'ok')], mem)).toEqual(['✓ TESTS PASSED · 002'])
  expect(milestones([step(1, 'test', 'failed'), step(2, 'test', 'ok'), step(3, 'test', 'ok')], mem)).toEqual([])
  expect(milestones([step(1, 'test', 'failed'), step(2, 'test', 'ok'), step(3, 'test', 'ok'), step(4, 'deploy', 'ok')], mem)).toEqual(['▲ DEPLOYED'])
})

test('a pass with no failure before it is quiet', () => {
  const mem = freshMemory()
  milestones([], mem)
  expect(milestones([step(1, 'test', 'ok')], mem)).toEqual([])
})

test('connected once per vendor, case-insensitive', () => {
  const mem = freshMemory()
  milestones([], mem)
  expect(milestones([step(1, 'external', 'ok', 'Stripe')], mem)).toEqual(['◆ CONNECTED · STRIPE'])
  expect(milestones([step(1, 'external', 'ok', 'Stripe'), step(2, 'external', 'ok', 'stripe')], mem)).toEqual([])
  expect(milestones([step(1, 'external', 'ok', 'Stripe'), step(2, 'external', 'ok', 'stripe'), step(3, 'external', 'failed', 'Supabase')], mem)).toEqual([])
})

test('a vendor seen in history does not toast later', () => {
  const mem = freshMemory()
  milestones([step(1, 'external', 'ok', 'Stripe')], mem)
  expect(milestones([step(1, 'external', 'ok', 'Stripe'), step(2, 'external', 'ok', 'Stripe')], mem)).toEqual([])
})

test('vendorOf reads the service label and cleans it', () => {
  expect(vendorOf(step(1, 'external', 'ok', 'Str\u001bipe'))).toBe('Str ipe')
  expect(vendorOf(step(1, 'external', 'ok'))).toBeUndefined()
})
