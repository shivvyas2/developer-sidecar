import { describe, expect, test } from 'vitest'
import type { Baseline } from '../src/city/baseline'
import { buildingFor, townOf, type TownInputStep } from '../src/city/town'

let n = 0
const step = (toolName: string, category: TownInputStep['category'], input: Record<string, unknown>, status: TownInputStep['status'] = 'ok', output?: unknown): TownInputStep =>
  ({ id: `t${++n}`, toolName, category, status, input, ...(output !== undefined ? { output } : {}) })
const write = (path: string, status: TownInputStep['status'] = 'ok') => step('Write', 'create', { file_path: `/p/${path}`, content: '' }, status)
const edit = (path: string, status: TownInputStep['status'] = 'ok') => step('Edit', 'edit', { file_path: `/p/${path}`, old_string: 'a', new_string: 'b' }, status)
const read = (path: string) => step('Read', 'read', { file_path: `/p/${path}` })
const bash = (command: string, category: TownInputStep['category'], status: TownInputStep['status'] = 'ok', output?: unknown) => step('Bash', category, { command }, status, output)
const prompt = () => step('UserPromptSubmit', 'prompt', { prompt: 'next' })
const git = { repo: false, remote: null, ignoresSecrets: false, ignoresDeps: false, ignoresBuild: false, readme: false }
const base = (o: Partial<Baseline> = {}): Baseline => ({ files: [], packages: [], folders: [], truncated: false, git, scannedAt: 0, ...o })
const town = (steps: TownInputStep[], baseline?: Baseline) => townOf(steps, { cwd: '/p', ...(baseline ? { baseline } : {}) })
const finish = (t: ReturnType<typeof town>, id: string) => t.buildings.find((b) => b.id === id)?.finish

describe('how far the town has grown', () => {
  test('nothing yet is an empty lot', () => expect(town([]).stage).toBe('lot'))
  test('only reading is digging', () => expect(town([read('notes.md')]).stage).toBe('dig'))
  test('an install lays the foundation', () => expect(town([bash('npm install zod', 'install')]).stage).toBe('foundation'))
  test('a code file is bricks', () => expect(town([write('lib/sum.ts')]).stage).toBe('bricks'))
  test('a passing test is concrete', () => expect(town([write('lib/sum.ts'), bash('npm test', 'test')]).stage).toBe('concrete'))
  test('a page is walls and paint', () => expect(town([write('app/page.tsx')]).stage).toBe('walls'))
  test('server code is neighbours', () => expect(town([write('app/api/checkout/route.ts')]).stage).toBe('neighbours'))
  test('a Stripe install is the neighbourhood', () => expect(town([bash('npm install stripe', 'install')]).stage).toBe('neighbourhood'))
  test('a deploy is the town', () => expect(town([write('app/page.tsx'), bash('vercel deploy --prod', 'deploy')]).stage).toBe('town'))
  test('a failed deploy is not', () => expect(town([write('app/page.tsx'), bash('vercel deploy', 'deploy', 'failed')]).stage).toBe('walls'))
  test('an existing app opens already grown', () => {
    expect(town([], base({ files: ['app/page.tsx', 'prisma/schema.prisma'], packages: ['stripe'] })).stage).toBe('neighbourhood')
  })
  test('the highest reached wins, so a page before any test is walls', () => {
    expect(town([bash('npm install next', 'install'), write('app/page.tsx')]).stage).toBe('walls')
  })
})

describe('buildings', () => {
  test('one shop per page, one office, one warehouse, a building per service', () => {
    const t = town([write('app/page.tsx'), write('app/cart/page.tsx'), write('app/api/a/route.ts'), write('server/b.ts'),
      write('prisma/schema.prisma'), bash('npm install stripe', 'install')])
    const kinds = t.buildings.map((b) => b.kind)
    expect(kinds.filter((k) => k === 'shop')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'office')).toHaveLength(1)
    expect(kinds.filter((k) => k === 'warehouse')).toHaveLength(1)
    expect(t.buildings.find((b) => b.kind === 'service')).toMatchObject({ name: 'Stripe', vendorKind: 'payments' })
    expect(kinds).toContain('yard')
    expect(kinds).toContain('siteOffice')
  })
  test('the archive stands once the project is a repository', () => {
    expect(town([], base({ git: { ...git, repo: true } })).buildings.some((b) => b.kind === 'archive')).toBe(true)
    expect(town([]).buildings.some((b) => b.kind === 'archive')).toBe(false)
  })
  test('paths outside the project make no building', () => {
    const t = townOf([step('Read', 'read', { file_path: '/Users/x/.zshrc' }), step('Write', 'create', { file_path: '/tmp/x.ts', content: '' }),
      step('Write', 'create', { file_path: 'C:\\tmp\\a.ts', content: '' })], { cwd: '/p' })
    expect(t.buildings.filter((b) => b.kind !== 'siteOffice')).toEqual([])
  })
  test('existing files are finished buildings', () => {
    expect(finish(town([], base({ files: ['app/page.tsx'] })), 'shop:page:page:')).toBe('built')
  })
  test('a file only read stands finished', () => {
    expect(finish(town([read('app/page.tsx')]), 'shop:page:page:')).toBe('built')
  })
})

describe('paint, smoke and fixes', () => {
  test('a change waits unpainted until a check passes', () => {
    expect(finish(town([write('app/page.tsx')]), 'shop:page:page:')).toBe('unpainted')
    expect(finish(town([write('app/page.tsx'), bash('npm test', 'test')]), 'shop:page:page:')).toBe('painted')
  })
  test('a successful build paints too', () => {
    expect(finish(town([write('app/page.tsx'), bash('npm run build', 'run')]), 'shop:page:page:')).toBe('painted')
  })
  test('changes after a pass wait for the next one', () => {
    const t = town([write('app/page.tsx'), bash('npm test', 'test'), edit('app/page.tsx')])
    expect(finish(t, 'shop:page:page:')).toBe('unpainted')
  })
  test('a failing test smokes everything changed since the last pass, and the inspector', () => {
    const t = town([write('app/page.tsx'), bash('npm test', 'test'), write('app/cart/page.tsx'), bash('npm test', 'test', 'failed')])
    expect(finish(t, 'shop:page:page:')).toBe('painted')
    expect(finish(t, 'shop:page:page:cart')).toBe('smoking')
    expect(finish(t, 'inspector')).toBe('smoking')
  })
  test('a later run of the same check passing marks them fixed', () => {
    const t = town([write('app/cart/page.tsx'), bash('npm test', 'test', 'failed'), edit('app/cart/page.tsx'), bash('npm test', 'test')])
    expect(finish(t, 'shop:page:page:cart')).toBe('fixed')
    expect(finish(t, 'inspector')).toBe('fixed')
  })
  test('fixed settles into painted at the next thing you ask', () => {
    const t = town([write('app/cart/page.tsx'), bash('npm test', 'test', 'failed'), bash('npm test', 'test'), prompt()])
    expect(finish(t, 'shop:page:page:cart')).toBe('painted')
  })
  test('a stopped check smokes nothing', () => {
    expect(finish(town([write('app/page.tsx'), bash('npm test', 'test', 'interrupted')]), 'shop:page:page:')).toBe('unpainted')
  })
  test('a failed edit smokes only its own building, and a good edit fixes it', () => {
    const t1 = town([write('app/page.tsx'), write('app/cart/page.tsx'), edit('app/cart/page.tsx', 'failed')])
    expect(finish(t1, 'shop:page:page:cart')).toBe('smoking')
    expect(finish(t1, 'shop:page:page:')).toBe('unpainted')
    const t2 = town([write('app/cart/page.tsx'), edit('app/cart/page.tsx', 'failed'), edit('app/cart/page.tsx')])
    expect(finish(t2, 'shop:page:page:cart')).toBe('fixed')
  })
  test('the newest change still running is rising', () => {
    expect(finish(town([write('app/page.tsx', 'running')]), 'shop:page:page:')).toBe('rising')
  })
})

describe('the shop lights', () => {
  const dev = bash('npm run dev', 'run', 'ok', { stdout: 'ready on http://localhost:3000\nCommand running in background with ID: b1' })
  test('a dev server that is up lights the shops', () => {
    expect(town([write('app/page.tsx'), dev]).buildings.find((b) => b.kind === 'shop')?.lit).toBe(true)
  })
  test('stopping its background command turns them off', () => {
    const t = town([write('app/page.tsx'), dev, step('KillShell', 'fallback', { shell_id: 'b1' })])
    expect(t.buildings.find((b) => b.kind === 'shop')?.lit).toBe(false)
  })
})

describe('buildingFor', () => {
  const steps = [write('app/page.tsx'), bash('npm install zod', 'install'), bash('npm test', 'test'), bash('git commit -m x', 'git'), bash('ls', 'fallback')]
  const t = town(steps)
  test.each([
    [0, 'shop:page:page:'], [1, 'yard'], [2, 'inspector'], [3, 'archive'], [4, 'site-office'],
  ])('step %i plays at %s', (i, id) => expect(buildingFor(steps[i]!, t)).toBe(id))
})
