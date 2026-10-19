import { expect, test } from 'vitest'
import { DEFAULT_SETTINGS, ExplanationSchema, SettingsSchema, isExplained, isRoutine, routineIds, trackTouched, writtenFile } from '../src/explain'
import type { Category, StepStatus } from '../src/step'

const ok = { plain: 'Claude added Stripe.', why: 'Payments need it.', concept: { term: 'SDK', definition: 'A ready-made library for a service.' }, decision: null }

test('ExplanationSchema accepts a full explanation and rejects empty text', () => {
  expect(ExplanationSchema.safeParse(ok).success).toBe(true)
  expect(ExplanationSchema.safeParse({ ...ok, plain: '' }).success).toBe(false)
  expect(ExplanationSchema.safeParse({ ...ok, concept: null }).success).toBe(true)
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

type S = { id: string; toolName: string; input: unknown; status: StepStatus; category: Category }
const s = (id: string, toolName: string, category: Category, input: unknown = {}, status: StepStatus = 'ok'): S => ({ id, toolName, category, input, status })
const edit = (id: string, file: string, status: StepStatus = 'ok') => s(id, 'Edit', 'edit', { file_path: file }, status)

test('writtenFile names the file only for write and edit tools', () => {
  expect(writtenFile({ toolName: 'Write', input: { file_path: '/a.ts' } })).toBe('/a.ts')
  expect(writtenFile({ toolName: 'NotebookEdit', input: { notebook_path: '/n.ipynb' } })).toBe('/n.ipynb')
  expect(writtenFile({ toolName: 'Read', input: { file_path: '/a.ts' } })).toBeUndefined()
  expect(writtenFile({ toolName: 'Edit', input: null })).toBeUndefined()
  expect(writtenFile({ toolName: 'Edit', input: { file_path: '' } })).toBeUndefined()
})

test('isRoutine: successful reads, and successful edits to an already-written file', () => {
  const touched = new Set(['/a.ts'])
  expect(isRoutine(s('r', 'Read', 'read'), touched)).toBe(true)
  expect(isRoutine(edit('e', '/a.ts'), touched)).toBe(true)
  expect(isRoutine(edit('e', '/b.ts'), touched)).toBe(false)
})

test('isRoutine never skips a failure, or a write that is not a plain edit', () => {
  const touched = new Set(['/a.ts', '/schema.ts'])
  expect(isRoutine(s('r', 'Read', 'read', {}, 'failed'), touched)).toBe(false)
  expect(isRoutine(edit('e', '/a.ts', 'failed'), touched)).toBe(false)
  expect(isRoutine(s('d', 'Edit', 'data', { file_path: '/schema.ts' }), touched)).toBe(false)
  expect(isRoutine(s('i', 'Bash', 'install'), touched)).toBe(false)
})

test('trackTouched adds successful writes and clears on a prompt', () => {
  const touched = new Set<string>()
  trackTouched(touched, s('w', 'Write', 'create', { file_path: '/a.ts' }))
  trackTouched(touched, edit('x', '/b.ts', 'failed'))
  expect([...touched]).toEqual(['/a.ts'])
  trackTouched(touched, s('p', 'UserPrompt', 'prompt'))
  expect(touched.size).toBe(0)
})

test('routineIds: the first edit is explained, repeats are not, until the next prompt', () => {
  const steps = [
    s('p1', 'UserPrompt', 'prompt'),
    s('r1', 'Read', 'read'),
    s('w1', 'Write', 'create', { file_path: '/a.ts' }),
    edit('e1', '/a.ts'),
    edit('e2', '/b.ts'),
    edit('e3', '/b.ts', 'failed'),
    edit('e4', '/b.ts'),
    s('p2', 'UserPrompt', 'prompt'),
    edit('e5', '/b.ts'),
    edit('e6', '/b.ts'),
  ]
  expect([...routineIds(steps)]).toEqual(['r1', 'e1', 'e4', 'e6'])
})
