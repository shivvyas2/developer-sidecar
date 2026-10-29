import { describe, expect, test } from 'vitest'
import { sceneOf } from '../src/city/scenes'
import { townOf } from '../src/city/town'
import type { FeedStep } from '../src/step'

let n = 0
const step = (toolName: string, category: FeedStep['category'], input: Record<string, unknown>, status: FeedStep['status'] = 'ok', output?: unknown): FeedStep => ({
  id: `s${++n}`, sessionId: 'x', toolName, category, status, input, startedAt: n, seq: n, caption: `caption ${n}`, techLabel: toolName,
  scene: { scene: 'thinking', cast: [], beats: [], caption: '' }, ...(output !== undefined ? { output } : {}),
})
const bash = (command: string, category: FeedStep['category'], status: FeedStep['status'] = 'ok', output?: unknown) => step('Bash', category, { command }, status, output)
const scene = (s: FeedStep, opts: { fixes?: boolean; waiting?: boolean } = {}) => sceneOf(s, townOf([s], { cwd: '/p' }), { cwd: '/p', ...opts })

describe('the scene for each kind of step', () => {
  test.each<[string, FeedStep, string]>([
    ['read', step('Read', 'read', { file_path: '/p/app/page.tsx' }), 'blueprint'],
    ['create', step('Write', 'create', { file_path: '/p/app/page.tsx', content: '' }), 'bricks'],
    ['edit', step('Edit', 'edit', { file_path: '/p/lib/a.ts', old_string: 'a', new_string: 'b' }), 'scaffold'],
    ['edit of a style', step('Edit', 'edit', { file_path: '/p/app/globals.css', old_string: 'a', new_string: 'b' }), 'paint'],
    ['install', bash('npm install zod', 'install'), 'delivery'],
    ['test', bash('npm test', 'test'), 'inspect'],
    ['build', bash('npm run build', 'run'), 'pour'],
    ['dev server', bash('npm run dev', 'run', 'ok', 'ready on http://localhost:3000'), 'lightsOn'],
    ['other run', bash('node scripts/seed.js', 'run'), 'toolbox'],
    ['external', step('WebFetch', 'external', { url: 'https://example.com' }), 'library'],
    ['mcp', step('mcp__linear__list', 'mcp', {}), 'cable'],
    ['commit', bash('git commit -m "x"', 'git'), 'photo'],
    ['branch', bash('git checkout -b feature', 'git'), 'branch'],
    ['switch -c', bash('git switch -c feature', 'git'), 'branch'],
    ['push', bash('git push origin main', 'git'), 'pushTruck'],
    ['pull', bash('git pull', 'git'), 'pullTruck'],
    ['pull request', bash('gh pr create --fill', 'git'), 'proposal'],
    ['merge', bash('git merge feature', 'git'), 'merge'],
    ['other git', bash('git status', 'git'), 'photo'],
    ['data', bash('npx prisma migrate dev', 'data'), 'forklift'],
    ['deploy', bash('vercel deploy', 'deploy'), 'ribbon'],
    ['subagent', step('Task', 'subagent', { description: 'x' }), 'helpers'],
    ['prompt', step('UserPromptSubmit', 'prompt', { prompt: 'hi' }), 'workOrder'],
    ['fallback', bash('ls', 'fallback'), 'toolbox'],
  ])('%s', (_name, s, kind) => expect(scene(s).kind).toBe(kind))
})

describe('overlays', () => {
  test('a failed test is failed', () => expect(scene(bash('npm test', 'test', 'failed')).overlay).toBe('failed'))
  test('a stopped dev server is stopped, never failed', () => expect(scene(bash('npm run dev', 'run', 'interrupted')).overlay).toBe('stopped'))
  test('a fix is fixed', () => expect(scene(bash('npm test', 'test'), { fixes: true }).overlay).toBe('fixed'))
  test('waiting for you', () => expect(scene(bash('rm -rf dist', 'fallback', 'running'), { waiting: true }).overlay).toBe('waiting'))
  test('otherwise none', () => expect(scene(bash('npm test', 'test')).overlay).toBe('none'))
})

test('the scene plays at the building and keeps the step caption', () => {
  const s = step('Write', 'create', { file_path: '/p/app/page.tsx', content: '' })
  expect(scene(s)).toMatchObject({ at: 'shop:page:page:', caption: s.caption, stepIds: [s.id], count: 1 })
})

test('stopping a background command turns the lights off', () => {
  expect(scene(step('KillShell', 'fallback', { shell_id: 'b1' })).kind).toBe('lightsOff')
  expect(scene(step('TaskStop', 'fallback', { task_id: 'b1' })).kind).toBe('lightsOff')
})
