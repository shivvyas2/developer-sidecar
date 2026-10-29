import { describe, expect, test } from 'vitest'
import { humanize, projectMap, tablesIn, type MapKind } from '../src/project-map'
import type { FeedStep } from '../src/step'
import type { Baseline } from '../src/city/baseline'

type S = Pick<FeedStep, 'id' | 'category' | 'status' | 'toolName' | 'input'>
let n = 0
const step = (toolName: string, category: S['category'], input: Record<string, unknown>, status: S['status'] = 'ok'): S =>
  ({ id: `t${++n}`, toolName, category, status, input })
const write = (path: string, content = '') => step('Write', 'create', { file_path: `/p/${path}`, content })
const edit = (path: string, status: S['status'] = 'ok') => step('Edit', 'edit', { file_path: `/p/${path}`, old_string: 'a', new_string: 'b' }, status)
const read = (path: string) => step('Read', 'read', { file_path: `/p/${path}` })
const bash = (command: string, category: S['category'] = 'fallback', status: S['status'] = 'ok') => step('Bash', category, { command }, status)

const flat = (steps: S[]) => projectMap(steps, '/p').sections.flatMap((s) => s.items.map((i) => [s.kind, i.name] as [MapKind, string]))

describe('where a file goes and what it is called', () => {
  test.each<[string, MapKind, string]>([
    // Next.js app router
    ['app/page.tsx', 'page', 'Home page'],
    ['app/success/page.tsx', 'page', 'Success page'],
    ['app/(shop)/products/[id]/page.tsx', 'page', 'Products id page'],
    ['src/app/dashboard/page.tsx', 'page', 'Dashboard page'],
    ['app/layout.tsx', 'page', 'Site layout'],
    ['app/admin/layout.tsx', 'page', 'Admin layout'],
    ['app/api/checkout/route.ts', 'backend', 'Checkout'],
    ['app/globals.css', 'page', 'Styles'],
    ['components/BuyButton.tsx', 'page', 'Buy button'],
    // Next.js pages router
    ['pages/index.tsx', 'page', 'Home page'],
    ['pages/about.tsx', 'page', 'About page'],
    ['pages/api/send-email.ts', 'backend', 'Send email'],
    // SvelteKit
    ['src/routes/+page.svelte', 'page', 'Home page'],
    ['src/routes/settings/+page.svelte', 'page', 'Settings page'],
    ['src/routes/api/items/+server.ts', 'backend', 'Items'],
    // Vite and plain sites
    ['src/App.tsx', 'page', 'App'],
    ['index.html', 'page', 'Index'],
    ['server/index.js', 'backend', 'Server'],
    // data, secrets, checks, services, helpers
    ['lib/schema.ts', 'data', 'Database tables'],
    ['prisma/schema.prisma', 'data', 'Database tables'],
    ['db/migrations/0001_init.sql', 'data', 'Database tables'],
    ['lib/db.ts', 'data', 'Database connection'],
    ['.env.local', 'secrets', '.env.local'],
    ['apps/web/.env', 'secrets', '.env'],
    ['lib/auth.test.ts', 'checks', 'Auth checks'],
    ['app/api/checkout/route.test.ts', 'checks', 'Checkout checks'],
    ['tests/test_orders.py', 'checks', 'Test orders checks'],
    ['lib/stripe.ts', 'service', 'Stripe'],
    ['lib/products.ts', 'code', 'Products'],
    ['scripts/seed_data.py', 'code', 'Seed data'],
  ])('%s is %s "%s"', (path, kind, name) => {
    expect(flat([write(path)])[0]).toEqual([kind, name])
  })

  test('config and unknown files are left off the map', () => {
    expect(flat([write('package.json'), write('README.md'), write('tsconfig.json'), write('.mcp.json')])).toEqual([])
  })
})

describe('what a session touched', () => {
  test('installs add building blocks, and known services', () => {
    expect(flat([bash('npm install stripe zod@3 @supabase/supabase-js', 'install')])).toEqual([
      ['service', 'Stripe'], ['service', 'Supabase'], ['blocks', 'stripe'], ['blocks', 'zod'], ['blocks', '@supabase/supabase-js'],
    ])
  })
  test('quoted package names count by name, without their quotes or version', () => {
    expect(flat([bash(`pip install "django>=4" 'requests==2.31'`, 'install')])).toEqual([['blocks', 'django'], ['blocks', 'requests']])
  })
  test('requirement files, editable folders and local paths are not building blocks', () => {
    const installs = ['pip install -r requirements.txt', 'pip install -e .', 'go get -u ./...', 'npm i ../local-pkg']
    expect(flat(installs.map((c) => bash(c, 'install')))).toEqual([])
  })
  test('only the install part of a chained command counts, and quoted words never do', () => {
    expect(flat([bash('cd app && npm i -D vitest && git commit -m "add stripe"', 'install')])).toEqual([['blocks', 'vitest']])
  })
  test('a schema names its tables', () => {
    const schema = write('lib/schema.ts', "export const orders = pgTable('orders', {})\nexport const lineItems = pgTable(\"line_items\", {})")
    expect(flat([schema])).toEqual([['data', 'Database tables'], ['data', 'Orders table'], ['data', 'Line items table']])
  })
  test('camelCase table names read as words', () => {
    const prisma = write('prisma/schema.prisma', 'model OrderItem {\n  id Int @id\n}')
    const mongoose = write('models/schema.js', "mongoose.model('BlogPost', schema)")
    expect(flat([prisma, mongoose]).filter(([k]) => k === 'data').map(([, n]) => n)).toEqual(['Database tables', 'Order item table', 'Blog post table'])
  })
  test('reading an env file through the shell is seen, never changed, and its contents are not used', () => {
    const map = projectMap([bash('cat .env.example', 'external')], '/p')
    expect(map.sections).toEqual([{ kind: 'secrets', title: 'Secret settings', items: [expect.objectContaining({ name: '.env.example', state: 'seen' })] }])
  })
  test('every env file a command names is on the map', () => {
    expect(flat([bash('cp .env.example .env.local', 'external')])).toEqual([['secrets', '.env.example'], ['secrets', '.env.local']])
  })
  test('web fetches name the service', () => {
    expect(flat([step('WebFetch', 'external', { url: 'https://docs.stripe.com/api' })])).toEqual([['service', 'Stripe']])
  })
  test('sections come in a fixed order and items in the order first touched', () => {
    const kinds = projectMap([write('lib/auth.test.ts'), write('app/page.tsx'), bash('npm i stripe', 'install'), write('lib/db.ts')], '/p').sections.map((s) => s.kind)
    expect(kinds).toEqual(['page', 'data', 'service', 'checks', 'blocks'])
  })
  test('without cwd, paths are matched by the folders in them', () => {
    const map = projectMap([step('Write', 'create', { file_path: '/Users/sam/shop/app/api/checkout/route.ts', content: '' })])
    expect(map.sections[0]!.items[0]!.name).toBe('Checkout')
  })
})

describe('state', () => {
  const stateOf = (steps: S[]) => projectMap(steps, '/p').sections[0]!.items[0]!.state
  test('read only is seen; a change is changed', () => {
    expect(stateOf([read('app/page.tsx')])).toBe('seen')
    expect(stateOf([read('app/page.tsx'), edit('app/page.tsx')])).toBe('changed')
  })
  test('the last change decides: failed, then fixed', () => {
    expect(stateOf([edit('lib/auth.ts'), edit('lib/auth.ts', 'failed')])).toBe('failed')
    expect(stateOf([edit('lib/auth.ts', 'failed'), edit('lib/auth.ts')])).toBe('changed')
  })
  test('a running or interrupted change touches the part but leaves its state alone', () => {
    const map = projectMap([read('lib/auth.ts'), edit('lib/auth.ts', 'running'), edit('lib/auth.ts', 'interrupted')], '/p')
    expect(map.sections[0]!.items[0]).toMatchObject({ state: 'seen', stepIds: [expect.any(String), expect.any(String), expect.any(String)] })
  })
  test('each item keeps its files and steps once each', () => {
    const steps = [write('app/page.tsx'), edit('app/page.tsx'), edit('app/page.tsx')]
    expect(projectMap(steps, '/p').sections[0]!.items[0]).toMatchObject({ files: ['app/page.tsx'], stepIds: steps.map((s) => s.id) })
  })
})

describe('helpers', () => {
  test('humanize', () => {
    expect(humanize('BuyButton')).toBe('Buy button')
    expect(humanize('send-email_now')).toBe('Send email now')
    expect(humanize('')).toBe('')
  })
  test('tablesIn reads Drizzle, Prisma, SQL and Mongoose, and caps the list', () => {
    expect(tablesIn("sqliteTable('users', {})\nmodel Post {\n}\nCREATE TABLE IF NOT EXISTS \"tags\" (id int)\nmongoose.model('Comment', s)"))
      .toEqual(['users', 'Post', 'tags', 'Comment'])
    expect(tablesIn(Array.from({ length: 30 }, (_, i) => `pgTable('t${i}')`).join('\n'))).toHaveLength(12)
    expect(tablesIn('no tables here')).toEqual([])
  })
  test('names keep their casing and are listed once whatever the case', () => {
    expect(tablesIn("model OrderItem {\n}\nCREATE TABLE orderitem (id int)\nmongoose.model('BlogPost', s)")).toEqual(['OrderItem', 'BlogPost'])
  })
  test('a schema-qualified SQL table is named by its table, not its schema', () => {
    expect(tablesIn('CREATE TABLE public.orders (id int)')).toEqual(['orders'])
    expect(tablesIn('create table if not exists "public"."orders" (id int)')).toEqual(['orders'])
    expect(tablesIn('CREATE TABLE `shop`.`line_items` (id int)')).toEqual(['line_items'])
    expect(tablesIn('CREATE TABLE [dbo].[users] (id int)')).toEqual(['users'])
  })
  test('odd input never throws', () => {
    expect(projectMap([step('Write', 'create', { file_path: 42 }), step('Bash', 'install', { command: null }), step('X', 'fallback', 'nope' as never)]).sections).toEqual([])
  })
})

describe('baseline', () => {
  const git = { repo: false, remote: null, ignoresSecrets: false, ignoresDeps: false, ignoresBuild: false, readme: false }
  const base = (o: Partial<Baseline> = {}): Baseline => ({ files: [], packages: [], folders: [], truncated: false, git, scannedAt: 0, ...o })
  const items = (m: ReturnType<typeof projectMap>) => Object.fromEntries(m.sections.flatMap((s) => s.items.map((i) => [i.id, i.state])))

  test('existing files become existing parts', () => {
    const m = projectMap([], '/p', base({ files: ['app/page.tsx', 'app/cart/page.tsx', 'prisma/schema.prisma', '.env.local'] }))
    expect(items(m)).toMatchObject({ 'page:page:': 'existing', 'page:page:cart': 'existing', 'data:tables': 'existing', 'secrets:.env.local': 'existing' })
  })

  test('a read keeps a part existing, an edit makes it changed', () => {
    const m = projectMap([read('app/page.tsx'), edit('app/cart/page.tsx')], '/p', base({ files: ['app/page.tsx', 'app/cart/page.tsx'] }))
    expect(items(m)).toMatchObject({ 'page:page:': 'existing', 'page:page:cart': 'changed' })
  })

  test('baseline packages and their vendors', () => {
    const m = projectMap([], '/p', base({ packages: ['next', 'stripe'] }))
    expect(items(m)).toMatchObject({ 'blocks:next': 'existing', 'blocks:stripe': 'existing', 'service:Stripe': 'existing' })
  })

  test('truncated folders stand in for files', () => {
    const m = projectMap([], '/p', base({ folders: ['legacy'], truncated: true }))
    expect(m.sections.find((s) => s.kind === 'code')?.items.map((i) => i.name)).toEqual(['Legacy'])
  })

  test('no baseline behaves as before', () => {
    const steps = [write('app/page.tsx'), bash('npm install stripe', 'install')]
    expect(projectMap(steps, '/p', undefined)).toEqual(projectMap(steps, '/p'))
  })
})
