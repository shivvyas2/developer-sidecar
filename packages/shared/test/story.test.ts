import { describe, expect, test } from 'vitest'
import { beatIds, phaseOf, storyOf, type StoryStep } from '../src/story'

let n = 0
const step = (toolName: string, category: StoryStep['category'], input: Record<string, unknown> = {}, status: StoryStep['status'] = 'ok'): StoryStep =>
  ({ id: `t${++n}`, toolName, category, status, input })
const prompt = (text: string) => step('UserPrompt', 'prompt', { prompt: text })
const read = (status: StoryStep['status'] = 'ok') => step('Read', 'read', { file_path: '/p/a.ts' }, status)
const edit = (file: string, status: StoryStep['status'] = 'ok') => step('Edit', 'edit', { file_path: file }, status)
const write = (file: string) => step('Write', 'create', { file_path: file })
const check = (command: string, status: StoryStep['status'] = 'ok') => step('Bash', 'test', { command }, status)
const types = (steps: StoryStep[]) => storyOf(steps)[0]!.beats.map((b) => (b.type === 'step' ? 'step' : `${b.type}:${b.ids.length}`))

describe('chapters', () => {
  test('one chapter per prompt, with what you asked and every other step', () => {
    const p1 = prompt('Add checkout'), a = write('/p/x.ts'), p2 = prompt('  Store orders  '), b = write('/p/y.ts')
    const story = storyOf([p1, a, p2, b])
    expect(story.map((c) => [c.id, c.promptId, c.asked, c.stepIds])).toEqual([[p1.id, p1.id, 'Add checkout', [a.id]], [p2.id, p2.id, 'Store orders', [b.id]]])
  })
  test('steps before the first prompt get their own chapter', () => {
    const a = read(), p = prompt('hi')
    const story = storyOf([a, p])
    expect(story[0]).toMatchObject({ id: a.id, promptId: null, asked: '', stepIds: [a.id] })
    expect(story[1]).toMatchObject({ promptId: p.id, stepIds: [], beats: [] })
  })
  test('no steps, no chapters', () => expect(storyOf([])).toEqual([]))
})

describe('beats', () => {
  test('two or more reads in a row fold into one beat; one read stays a step', () => {
    expect(types([prompt('x'), read(), read(), read(), write('/p/b.ts'), read()])).toEqual(['looked:3', 'step', 'step'])
  })
  test('a failed or running read breaks the run and stays visible', () => {
    expect(types([prompt('x'), read(), read('failed'), read(), read('running')])).toEqual(['step', 'step', 'step', 'step'])
  })
  test('repeat changes to one file fold together; a different file or a failed change does not', () => {
    expect(types([prompt('x'), edit('/p/a.ts'), edit('/p/a.ts'), edit('/p/a.ts'), edit('/p/b.ts'), edit('/p/b.ts', 'failed'), edit('/p/b.ts')]))
      .toEqual(['edits:3', 'step', 'step', 'step'])
  })
  test('a write and an edit to the same file are not folded (making a file is its own step)', () => {
    expect(types([prompt('x'), write('/p/a.ts'), edit('/p/a.ts')])).toEqual(['step', 'step'])
  })
  test('beats keep every step exactly once, in order', () => {
    const steps = [prompt('x'), read(), read(), edit('/p/a.ts'), edit('/p/a.ts'), check('npm test', 'failed'), edit('/p/a.ts'), check('npm test')]
    const c = storyOf(steps)[0]!
    expect(c.beats.flatMap(beatIds)).toEqual(c.stepIds)
  })
  test('phases follow the category', () => {
    expect(['read', 'create', 'install', 'test', 'run', 'git', 'deploy', 'fallback'].map((c) => phaseOf(c as StoryStep['category'])))
      .toEqual(['looking', 'building', 'building', 'checking', 'checking', 'saving', 'saving', 'other'])
  })
})

describe('problem, then fixed', () => {
  test('a passing run of the same checks fixes the failed one', () => {
    const fail = check('npx vitest run', 'failed'), fix = edit('/p/a.ts'), pass = check('npx vitest  run')
    const c = storyOf([prompt('x'), fail, fix, pass])[0]!
    expect(c.fixes).toBe(1)
    expect(c.beats).toContainEqual(expect.objectContaining({ id: fail.id, fixedBy: pass.id }))
    expect(c.beats).toContainEqual(expect.objectContaining({ id: pass.id, fixes: fail.id }))
    expect(c.outcome).toBe('fixed')
  })
  test('a broader run covers narrower failed runs; two failures, one fix', () => {
    const f1 = check('npx vitest run lib/auth.test.ts', 'failed'), f2 = check('npx vitest run lib/auth.test.ts', 'failed'), pass = check('npx vitest run')
    const c = storyOf([prompt('x'), f1, f2, pass])[0]!
    expect(c.fixes).toBe(1)
    expect(c.beats.filter((b) => b.type === 'step' && b.fixedBy === pass.id)).toHaveLength(2)
  })
  test('the same checks run another way still fix it: after cd, chained, or through npm run', () => {
    const fixes = (failed: string, passed: string) => storyOf([prompt('x'), check(failed, 'failed'), check(passed)])[0]!.fixes
    expect(fixes('npx vitest run', 'cd app && npx vitest run')).toBe(1)
    expect(fixes('npm test', 'npm test && npm run lint')).toBe(1)
    expect(fixes('npm test', 'npm run test')).toBe(1)
    expect(fixes('pnpm run test', 'pnpm test')).toBe(1)
    expect(fixes('npx vitest run lib/a.test.ts', 'pnpm exec vitest run')).toBe(1)
    expect(fixes('cd app && npm test -- lib/a.test.ts', 'cd app && npm test')).toBe(1)
  })
  test('quoted text still tells two runs apart', () => {
    const c = storyOf([prompt('x'), check('npx vitest run -t "checkout total"', 'failed'), check('npx vitest run -t "login"')])[0]!
    expect(c.fixes).toBe(0)
  })
  test('a narrower or different run does not fix a broader failure', () => {
    const c = storyOf([prompt('x'), check('npx vitest run', 'failed'), check('npx vitest run lib/a.test.ts'), check('npm run lint')])[0]!
    expect(c.fixes).toBe(0)
    expect(c.outcome).toBe('failing')
  })
  test('an interrupted run is never a fix', () => {
    const c = storyOf([prompt('x'), check('npm test', 'failed'), check('npm test', 'interrupted')])[0]!
    expect(c.fixes).toBe(0)
  })
  test('a fix in one chapter never reaches back into another', () => {
    const story = storyOf([prompt('a'), check('npm test', 'failed'), prompt('b'), check('npm test')])
    expect(story.map((c) => c.fixes)).toEqual([0, 0])
    expect(story.map((c) => c.outcome)).toEqual(['failing', 'good'])
  })
})

describe('outcome', () => {
  const out = (steps: StoryStep[], open = false) => storyOf([prompt('x'), ...steps], open)[0]!.outcome
  test('working while a step runs or while Claude is still on it', () => {
    expect(out([write('/p/a.ts'), check('npm test', 'running')])).toBe('working')
    expect(out([write('/p/a.ts')], true)).toBe('working')
  })
  test('only the last chapter can be open', () => {
    expect(storyOf([prompt('a'), write('/p/a.ts'), prompt('b')], true).map((c) => c.outcome)).toEqual(['good', 'working'])
  })
  test('failing when the last checks or the last change failed; reads after it say nothing', () => {
    expect(out([check('npm test', 'failed'), edit('/p/a.ts')])).toBe('failing')
    expect(out([edit('/p/a.ts', 'failed'), read()])).toBe('failing')
    expect(out([edit('/p/a.ts', 'failed'), edit('/p/a.ts')])).toBe('good')
  })
  test('stopped when cut short, good otherwise', () => {
    expect(out([write('/p/a.ts'), step('Bash', 'run', { command: 'npm run dev' }, 'interrupted')])).toBe('stopped')
    expect(out([write('/p/a.ts')])).toBe('good')
    expect(out([])).toBe('good')
  })
})
