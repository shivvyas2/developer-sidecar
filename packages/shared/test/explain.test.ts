import { expect, test } from 'vitest'
import { DEFAULT_SETTINGS, ExplanationSchema, SettingsSchema, isExplained } from '../src/explain'

const ok = { plain: 'Claude added Stripe.', why: 'Payments need it.', concept: { term: 'SDK', definition: 'A ready-made library for a service.' }, decision: null }

test('ExplanationSchema accepts a full explanation and rejects empty text', () => {
  expect(ExplanationSchema.safeParse(ok).success).toBe(true)
  expect(ExplanationSchema.safeParse({ ...ok, plain: '' }).success).toBe(false)
  expect(ExplanationSchema.safeParse({ ...ok, concept: null }).success).toBe(true)
  expect(ExplanationSchema.safeParse({ ...ok, next: 'Fix the failing test.' }).success).toBe(true)
  expect(ExplanationSchema.safeParse({ ...ok, next: '' }).success).toBe(false)
  expect(ExplanationSchema.safeParse({ ...ok, decision: { title: 'Payments', choice: 'Stripe', alternatives: ['Paddle'], reason: 'Popular' } }).success).toBe(true)
})

test('settings default to haiku and reject unknown levels', () => {
  expect(DEFAULT_SETTINGS).toEqual({ explanations: 'haiku' })
  expect(SettingsSchema.safeParse({ explanations: 'opus' }).success).toBe(false)
})

test('isExplained tells explanations from unavailable markers', () => {
  expect(isExplained(ok)).toBe(true)
  expect(isExplained({ unavailable: 'rate limited' })).toBe(false)
  expect(isExplained(undefined)).toBe(false)
})
