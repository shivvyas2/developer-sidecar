import { describe, expect, test } from 'vitest'
import { DEMO, demoAt, demoElapsed } from '../src/demo/demo'

describe('demoAt', () => {
  test('one more step every stepMs, then a rest, then it starts over', () => {
    expect(demoAt(0, 3, 100, 50)).toEqual({ loop: 0, count: 1, done: false })
    expect(demoAt(199, 3, 100, 50)).toEqual({ loop: 0, count: 2, done: false })
    expect(demoAt(299, 3, 100, 50)).toEqual({ loop: 0, count: 3, done: false })
    expect(demoAt(300, 3, 100, 50)).toEqual({ loop: 0, count: 3, done: true })
    expect(demoAt(350, 3, 100, 50)).toEqual({ loop: 1, count: 1, done: false })
  })
  test('odd input never breaks it', () => {
    expect(demoAt(-5, 3, 100, 50)).toEqual({ loop: 0, count: 1, done: false })
    expect(demoAt(10, 0)).toEqual({ loop: 0, count: 0, done: true })
  })
})

test('the demo clock starts once, so leaving the Stage and coming back resumes it', () => {
  expect(demoElapsed(1000)).toBe(0)
  expect(demoElapsed(6200)).toBe(5200)
  expect(demoElapsed(9000)).toBe(8000)
})

test('the sample is the Stripe checkout session, prompt first', () => {
  expect(DEMO.project).toBe('shop')
  expect(DEMO.steps).toHaveLength(37)
  expect(DEMO.steps[0]!.category).toBe('prompt')
})
