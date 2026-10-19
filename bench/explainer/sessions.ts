/**
 * Sample Claude Code sessions as raw hook payloads, the same shape the plugin's emit hook posts.
 * Tool responses follow what Claude Code really sends (Edit carries originalFile and structuredPatch,
 * Write echoes its content, Read returns the file, Bash returns stdout/stderr, failures arrive as
 * PostToolUseFailure with an error string). Contents are invented; a few fake secrets keep scrubbing honest.
 */

export interface BenchEvent { payload: Record<string, unknown>; gapMs: number }
export interface BenchSession { name: string; events: BenchEvent[] }

const STEP_GAP = 1500
const PROMPT_GAP = 30_000

/** Deterministic tool_use ids that look like Claude Code's (toolu_01 + 22 chars). */
function idMaker(seed: number) {
  let x = seed
  return () => {
    let s = ''
    for (let i = 0; i < 22; i++) {
      x = (x * 1103515245 + 12345) >>> 0
      s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[x % 62]
    }
    return `toolu_01${s}`
  }
}

const lines = (s: string) => s.split('\n').length
const patch = (oldStr: string, newStr: string) => [{
  oldStart: 1, oldLines: lines(oldStr), newStart: 1, newLines: lines(newStr),
  lines: [...oldStr.split('\n').map((l) => `-${l}`), ...newStr.split('\n').map((l) => `+${l}`)],
}]

function builder(name: string, cwd: string, seed: number) {
  const sid = `bench-${name}`
  const nextId = idMaker(seed)
  const events: BenchEvent[] = []
  const files = new Map<string, string>()
  const base = (hook: string) => ({ session_id: sid, cwd, hook_event_name: hook })
  const abs = (p: string) => `${cwd}/${p}`

  const tool = (toolName: string, input: Record<string, unknown>, response: unknown, failure?: string) => {
    const id = nextId()
    events.push({ gapMs: STEP_GAP, payload: { ...base('PreToolUse'), tool_name: toolName, tool_use_id: id, tool_input: input } })
    events.push({
      gapMs: 400,
      payload: failure === undefined
        ? { ...base('PostToolUse'), tool_name: toolName, tool_use_id: id, tool_input: input, tool_response: response }
        : { ...base('PostToolUseFailure'), tool_name: toolName, tool_use_id: id, tool_input: input, error: failure },
    })
  }

  const b = {
    start() { events.push({ gapMs: 0, payload: { ...base('SessionStart'), source: 'startup' } }); return b },
    prompt(text: string) { events.push({ gapMs: PROMPT_GAP, payload: { ...base('UserPromptSubmit'), prompt: text } }); return b },
    /** Seed a file that exists before the session starts. */
    has(path: string, content: string) { files.set(abs(path), content); return b },
    read(path: string) {
      const content = files.get(abs(path)) ?? ''
      tool('Read', { file_path: abs(path) }, {
        type: 'text', file: { filePath: abs(path), content, numLines: lines(content), startLine: 1, totalLines: lines(content) },
      })
      return b
    },
    grep(pattern: string, hits: string[]) {
      tool('Grep', { pattern, output_mode: 'files_with_matches' }, { mode: 'files_with_matches', numFiles: hits.length, filenames: hits.map(abs) })
      return b
    },
    glob(pattern: string, hits: string[]) {
      tool('Glob', { pattern }, { filenames: hits.map(abs), durationMs: 12, numFiles: hits.length, truncated: false })
      return b
    },
    write(path: string, content: string) {
      files.set(abs(path), content)
      tool('Write', { file_path: abs(path), content }, {
        type: 'create', filePath: abs(path), content, structuredPatch: patch('', content), originalFile: null, userModified: false,
      })
      return b
    },
    edit(path: string, oldString: string, newString: string, opts: { fail?: string } = {}) {
      const originalFile = files.get(abs(path)) ?? ''
      const input = { file_path: abs(path), old_string: oldString, new_string: newString }
      if (opts.fail) { tool('Edit', input, undefined, opts.fail); return b }
      files.set(abs(path), originalFile.replace(oldString, newString))
      tool('Edit', input, {
        filePath: abs(path), oldString, newString, originalFile, structuredPatch: patch(oldString, newString),
        userModified: false, replaceAll: false,
      })
      return b
    },
    bash(command: string, stdout = '', opts: { stderr?: string; fail?: string; description?: string } = {}) {
      const input = { command, description: opts.description ?? command.split(' ').slice(0, 3).join(' ') }
      if (opts.fail) { tool('Bash', input, undefined, opts.fail); return b }
      tool('Bash', input, { stdout, stderr: opts.stderr ?? '', interrupted: false, isImage: false, noOutputExpected: false })
      return b
    },
    stop() { events.push({ gapMs: STEP_GAP, payload: { ...base('Stop') } }); return b },
    done(): BenchSession { return { name, events } },
  }
  return b
}

/* ---------- file bodies ---------- */

const PACKAGE_JSON = `{
  "name": "shop",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "test": "vitest run" },
  "dependencies": { "next": "16.1.0", "react": "19.2.0", "react-dom": "19.2.0" },
  "devDependencies": { "typescript": "5.9.3", "vitest": "5.0.4", "@types/react": "19.2.1" }
}`

const LAYOUT_TSX = `import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: 'Shop', description: 'A small shop' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-900">
        <header className="border-b px-6 py-4 font-semibold">Shop</header>
        <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
      </body>
    </html>
  )
}`

const PRODUCTS_TS = `export interface Product { id: string; name: string; priceCents: number; image: string }

export const products: Product[] = [
  { id: 'mug', name: 'Enamel mug', priceCents: 1800, image: '/mug.jpg' },
  { id: 'tote', name: 'Canvas tote', priceCents: 2400, image: '/tote.jpg' },
  { id: 'cap', name: 'Wool cap', priceCents: 3200, image: '/cap.jpg' },
]

export function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id)
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}`

const PAGE_TSX = `import { products, formatPrice } from '@/lib/products'

export default function Home() {
  return (
    <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {products.map((p) => (
        <article key={p.id} className="rounded-lg border p-4">
          <img src={p.image} alt="" className="aspect-square w-full rounded object-cover" />
          <h2 className="mt-3 font-medium">{p.name}</h2>
          <p className="text-zinc-600">{formatPrice(p.priceCents)}</p>
        </article>
      ))}
    </section>
  )
}`

const STRIPE_TS = `import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
if (!key) throw new Error('STRIPE_SECRET_KEY is not set')

export const stripe = new Stripe(key, { apiVersion: '2026-09-30.acacia' })

export function toLineItem(name: string, priceCents: number, quantity = 1): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity,
    price_data: { currency: 'usd', unit_amount: priceCents, product_data: { name } },
  }
}`

const CHECKOUT_ROUTE = `import { NextResponse } from 'next/server'
import { stripe, toLineItem } from '@/lib/stripe'
import { findProduct } from '@/lib/products'

export async function POST(req: Request) {
  const { productId, quantity } = (await req.json()) as { productId: string; quantity?: number }
  const product = findProduct(productId)
  if (!product) return NextResponse.json({ error: 'Unknown product' }, { status: 404 })

  const origin = req.headers.get('origin') ?? 'http://localhost:3000'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [toLineItem(product.name, product.priceCents, quantity)],
    success_url: \`\${origin}/success?session_id={CHECKOUT_SESSION_ID}\`,
    cancel_url: \`\${origin}/\`,
  })
  return NextResponse.json({ url: session.url })
}`

const BUY_BUTTON = `'use client'
import { useState } from 'react'

export function BuyButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false)
  async function buy() {
    setBusy(true)
    const res = await fetch('/api/checkout', { method: 'POST', body: JSON.stringify({ productId }) })
    const { url } = await res.json()
    window.location.href = url
  }
  return (
    <button onClick={buy} disabled={busy} className="mt-3 rounded bg-black px-4 py-2 text-white disabled:opacity-50">
      {busy ? 'Redirecting…' : 'Buy'}
    </button>
  )
}`

const CHECKOUT_TEST = `import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })) } } },
  toLineItem: (name: string, priceCents: number, quantity = 1) => ({ name, priceCents, quantity }),
}))

import { POST } from '@/app/api/checkout/route'

const req = (body: unknown) => new Request('http://localhost/api/checkout', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/checkout', () => {
  test('returns a Stripe checkout url for a known product', async () => {
    const res = await POST(req({ productId: 'mug' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
  })
  test('404s for an unknown product', async () => {
    const res = await POST(req({ productId: 'nope' }))
    expect(res.status).toBe(404)
  })
  test('rejects a quantity below one', async () => {
    const res = await POST(req({ productId: 'mug', quantity: 0 }))
    expect(res.status).toBe(400)
  })
})`

const NPM_INSTALL_OUT = `
added 1 package, and audited 312 packages in 3s

84 packages are looking for funding
  run \`npm fund\` for details

found 0 vulnerabilities`

const VITEST_FAIL = `Exit code 1

 RUN  v5.0.4 /Users/sam/shop

 ✓ src/lib/products.test.ts (3 tests) 4ms
 ❯ src/app/api/checkout/route.test.ts (3 tests | 1 failed) 21ms
   ✓ POST /api/checkout > returns a Stripe checkout url for a known product 9ms
   ✓ POST /api/checkout > 404s for an unknown product 2ms
   × POST /api/checkout > rejects a quantity below one 6ms
     → expected 200 to be 400 // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/api/checkout/route.test.ts > POST /api/checkout > rejects a quantity below one
AssertionError: expected 200 to be 400 // Object.is equality

- Expected
+ Received

- 400
+ 200

 ❯ src/app/api/checkout/route.test.ts:26:24
     24|   test('rejects a quantity below one', async () => {
     25|     const res = await POST(req({ productId: 'mug', quantity: 0 }))
     26|     expect(res.status).toBe(400)
       |                        ^
     27|   })
     28| })

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 5 passed (6)
   Start at  14:02:11
   Duration  412ms (transform 88ms, setup 0ms, collect 140ms, tests 25ms, environment 0ms, prepare 61ms)`

const VITEST_PASS = `
 RUN  v5.0.4 /Users/sam/shop

 ✓ src/lib/products.test.ts (3 tests) 4ms
 ✓ src/app/api/checkout/route.test.ts (3 tests) 19ms

 Test Files  2 passed (2)
      Tests  6 passed (6)
   Start at  14:03:40
   Duration  398ms (transform 85ms, setup 0ms, collect 133ms, tests 23ms, environment 0ms, prepare 58ms)`

const SRC_LISTING = `app
components
lib
public
next.config.ts
package.json
tsconfig.json
vitest.config.ts`

const GIT_LOG = `a41c9e2 (HEAD -> main) add product grid
7d0f1b3 layout and globals
2c9a6e8 init next app`

const GIT_STATUS_DIRTY = `On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
	modified:   app/api/checkout/route.ts
	modified:   app/page.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/checkout/route.test.ts
	components/BuyButton.tsx
	lib/stripe.ts

no changes added to commit (use "git add" and/or "git commit -a")`

const AUTH_TS = `import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.SESSION_SECRET ?? ''

export interface SessionUser { id: string; email: string }

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('base64url')
}

export async function readSession(): Promise<SessionUser | null> {
  const raw = (await cookies()).get('session')?.value
  if (!raw) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionUser
}

export function sessionCookie(user: SessionUser): string {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url')
  return \`\${payload}.\${sign(payload)}\`
}`

const AUTH_TEST = `import { describe, expect, test, vi } from 'vitest'

const jar = new Map<string, string>()
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined) }) }))
vi.stubEnv('SESSION_SECRET', 'test-secret')

const { readSession, sessionCookie } = await import('@/lib/auth')

describe('session cookies', () => {
  test('round-trips a user', async () => {
    jar.set('session', sessionCookie({ id: 'u1', email: 'a@b.co' }))
    expect(await readSession()).toEqual({ id: 'u1', email: 'a@b.co' })
  })
  test('rejects a tampered cookie', async () => {
    jar.set('session', sessionCookie({ id: 'u1', email: 'a@b.co' }).replace(/.$/, 'x'))
    expect(await readSession()).toBeNull()
  })
  test('rejects a cookie with no signature', async () => {
    jar.set('session', 'eyJpZCI6InUxIn0')
    expect(await readSession()).toBeNull()
  })
})`

const AUTH_FAIL = `Exit code 1

 RUN  v5.0.4 /Users/sam/shop

 ❯ src/lib/auth.test.ts (3 tests | 2 failed) 31ms
   ✓ session cookies > round-trips a user 8ms
   × session cookies > rejects a tampered cookie 12ms
     → Input buffers must have the same byte length
   × session cookies > rejects a cookie with no signature 3ms
     → Cannot read properties of undefined (reading 'length')

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/auth.test.ts > session cookies > rejects a tampered cookie
RangeError: Input buffers must have the same byte length
 ❯ readSession src/lib/auth.ts:18:52
     16|   if (!payload || !sig) return null
     17|   const expected = sign(payload)
     18|   if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
       |                                                    ^
     19|   return JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionUser
 ❯ src/lib/auth.test.ts:16:18

 FAIL  src/lib/auth.test.ts > session cookies > rejects a cookie with no signature
TypeError: Cannot read properties of undefined (reading 'length')
 ❯ readSession src/lib/auth.ts:18:11

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Duration  377ms`

const AUTH_FAIL_2 = `Exit code 1

 RUN  v5.0.4 /Users/sam/shop

 ❯ src/lib/auth.test.ts (3 tests | 1 failed) 22ms
   ✓ session cookies > round-trips a user 7ms
   ✓ session cookies > rejects a tampered cookie 4ms
   × session cookies > rejects a cookie with no signature 3ms
     → expected { id: 'u1' } to be null

 FAIL  src/lib/auth.test.ts > session cookies > rejects a cookie with no signature
AssertionError: expected { id: 'u1' } to be null
 ❯ src/lib/auth.test.ts:22:34

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Duration  351ms`

const AUTH_PASS = `
 RUN  v5.0.4 /Users/sam/shop

 ✓ src/lib/auth.test.ts (3 tests) 18ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  340ms`

const DB_TS = `import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })`

const SCHEMA_TS = `import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  quantity: integer('quantity').notNull().default(1),
  stripeSessionId: text('stripe_session_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})`

/* ---------- sessions ---------- */

/** Built at runtime so secret scanners don't flag the source; the scrubber must still redact it. */
const FAKE_STRIPE_KEY = 'sk_test_' + '51P' + 'a'.repeat(44)

/** A new feature from scratch: reads, installs, new files, an edit loop on one file, a failing then passing test, a commit. */
const buildStripeApp = builder('build-stripe-app', '/Users/sam/shop', 11)
  .has('package.json', PACKAGE_JSON).has('app/layout.tsx', LAYOUT_TSX).has('lib/products.ts', PRODUCTS_TS).has('app/page.tsx', PAGE_TSX)
  .start()
  .prompt('Add Stripe checkout so people can buy a product from the grid')
  .bash('ls', SRC_LISTING)
  .read('package.json')
  .read('app/layout.tsx')
  .glob('app/**/*.tsx', ['app/layout.tsx', 'app/page.tsx'])
  .read('app/page.tsx')
  .read('lib/products.ts')
  .grep('formatPrice', ['lib/products.ts', 'app/page.tsx'])
  .bash('npm install stripe', NPM_INSTALL_OUT)
  .write('.env.local', `STRIPE_SECRET_KEY=${FAKE_STRIPE_KEY}\nNEXT_PUBLIC_SITE_URL=http://localhost:3000`)
  .write('lib/stripe.ts', STRIPE_TS)
  .write('app/api/checkout/route.ts', CHECKOUT_ROUTE)
  .write('components/BuyButton.tsx', BUY_BUTTON)
  .edit('app/page.tsx', `import { products, formatPrice } from '@/lib/products'`, `import { products, formatPrice } from '@/lib/products'\nimport { BuyButton } from '@/components/BuyButton'`)
  .edit('app/page.tsx', `<p className="text-zinc-600">{formatPrice(p.priceCents)}</p>`, `<p className="text-zinc-600">{formatPrice(p.priceCents)}</p>\n          <BuyButton productId={p.id} />`)
  .edit('app/page.tsx', `className="rounded-lg border p-4"`, `className="flex flex-col rounded-lg border p-4"`)
  .write('app/success/page.tsx', `export default function Success() {\n  return <p className="text-lg">Thanks! Your order is on its way.</p>\n}`)
  .write('app/api/checkout/route.test.ts', CHECKOUT_TEST)
  .bash('npx vitest run', '', { fail: VITEST_FAIL })
  .read('app/api/checkout/route.ts')
  .edit('app/api/checkout/route.ts', `  const product = findProduct(productId)`, `  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {\n    return NextResponse.json({ error: 'Quantity must be at least 1' }, { status: 400 })\n  }\n  const product = findProduct(productId)`)
  .bash('npx vitest run', VITEST_PASS)
  .bash('npx tsc --noEmit', '')
  .bash('npm run build', `\n> shop@0.1.0 build\n> next build\n\n   ▲ Next.js 16.1.0\n\n   Creating an optimized production build ...\n ✓ Compiled successfully in 4.1s\n ✓ Linting and checking validity of types\n ✓ Collecting page data\n ✓ Generating static pages (6/6)\n\nRoute (app)                Size  First Load JS\n┌ ○ /                     1.9 kB        104 kB\n├ ƒ /api/checkout          139 B        102 kB\n└ ○ /success               139 B        102 kB`)
  .bash('git status', GIT_STATUS_DIRTY)
  .bash('git diff', `diff --git a/app/page.tsx b/app/page.tsx\nindex 3b1c2d4..9f0e8a1 100644\n--- a/app/page.tsx\n+++ b/app/page.tsx\n@@ -1,4 +1,5 @@\n import { products, formatPrice } from '@/lib/products'\n+import { BuyButton } from '@/components/BuyButton'\n`)
  .bash('git add -A && git commit -m "Add Stripe checkout"', `[main 5e2d7c1] Add Stripe checkout\n 7 files changed, 118 insertions(+), 2 deletions(-)`)
  .stop()
  .prompt('Store each order in Postgres so we can see what sold')
  .read('lib/stripe.ts')
  .bash('npm install drizzle-orm pg', NPM_INSTALL_OUT)
  .bash('npm install -D drizzle-kit @types/pg', NPM_INSTALL_OUT)
  .write('lib/db.ts', DB_TS)
  .write('lib/schema.ts', SCHEMA_TS)
  .bash('npx drizzle-kit generate', `Reading config file '/Users/sam/shop/drizzle.config.ts'\n1 tables\norders 5 columns 0 indexes 0 fks\n\n[✓] Your SQL migration file ➜ drizzle/0000_orders.sql 🚀`)
  .edit('app/api/checkout/route.ts', `  return NextResponse.json({ url: session.url })`, `  await db.insert(orders).values({ id: crypto.randomUUID(), productId, quantity: quantity ?? 1, stripeSessionId: session.id })\n  return NextResponse.json({ url: session.url })`)
  .edit('app/api/checkout/route.ts', `import { findProduct } from '@/lib/products'`, `import { findProduct } from '@/lib/products'\nimport { db } from '@/lib/db'\nimport { orders } from '@/lib/schema'`)
  .bash('npx vitest run', VITEST_PASS)
  .stop()
  .done()

/** A repair loop: two files edited again and again, a failed Edit, tests failing with long output twice before passing. */
const fixFailingTest = builder('fix-failing-test', '/Users/sam/shop', 23)
  .has('lib/auth.ts', AUTH_TS).has('lib/auth.test.ts', AUTH_TEST)
  .start()
  .prompt('The auth tests are failing after my last change, can you fix them?')
  .bash('npx vitest run lib/auth.test.ts', '', { fail: AUTH_FAIL })
  .read('lib/auth.ts')
  .read('lib/auth.test.ts')
  .grep('timingSafeEqual', ['lib/auth.ts'])
  .edit('lib/auth.ts', `  if (!payload || !sig) return null`, `  if (!payload || sig === undefined) return null`, { fail: 'String to replace not found in file.\nString:   if (!payload || !sig) return null' })
  .read('lib/auth.ts')
  .edit('lib/auth.ts', `  const [payload, sig] = raw.split('.')`, `  const parts = raw.split('.')\n  if (parts.length !== 2) return null\n  const [payload, sig] = parts`)
  .edit('lib/auth.ts', `  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null`, `  const a = Buffer.from(sig)\n  const b = Buffer.from(expected)\n  if (a.length !== b.length || !timingSafeEqual(a, b)) return null`)
  .bash('npx vitest run lib/auth.test.ts', '', { fail: AUTH_FAIL_2 })
  .read('lib/auth.ts')
  .edit('lib/auth.ts', `  const parts = raw.split('.')\n  if (parts.length !== 2) return null\n  const [payload, sig] = parts`, `  const parts = raw.split('.')\n  if (parts.length !== 2 || !parts[0] || !parts[1]) return null\n  const [payload, sig] = parts as [string, string]`)
  .edit('lib/auth.ts', `  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionUser`, `  try {\n    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionUser\n  } catch {\n    return null\n  }`)
  .bash('npx vitest run lib/auth.test.ts', AUTH_PASS)
  .edit('lib/auth.test.ts', `  test('rejects a cookie with no signature', async () => {`, `  test('rejects a cookie with garbage JSON', async () => {\n    jar.set('session', sessionCookie({ id: 'u1', email: 'a@b.co' }).replace(/^[^.]+/, 'bm90LWpzb24'))\n    expect(await readSession()).toBeNull()\n  })\n  test('rejects a cookie with no signature', async () => {`)
  .edit('lib/auth.test.ts', `vi.stubEnv('SESSION_SECRET', 'test-secret')`, `vi.stubEnv('SESSION_SECRET', 'test-secret-that-is-long-enough')`)
  .bash('npx vitest run', `\n RUN  v5.0.4 /Users/sam/shop\n\n ✓ src/lib/auth.test.ts (4 tests) 19ms\n ✓ src/lib/products.test.ts (3 tests) 4ms\n ✓ src/app/api/checkout/route.test.ts (3 tests) 18ms\n\n Test Files  3 passed (3)\n      Tests  10 passed (10)\n   Duration  455ms`)
  .bash('npx tsc --noEmit', '')
  .bash('git diff --stat', ` lib/auth.test.ts |  6 +++++-\n lib/auth.ts      | 15 +++++++++++----\n 2 files changed, 16 insertions(+), 5 deletions(-)`)
  .bash('git add -A && git commit -m "Fix session cookie parsing"', `[main 8a1f3d2] Fix session cookie parsing\n 2 files changed, 16 insertions(+), 5 deletions(-)`)
  .stop()
  .done()

/** Mostly reading: someone asks how the app works; one install near the end. */
const exploreCodebase = builder('explore-codebase', '/Users/sam/shop', 37)
  .has('package.json', PACKAGE_JSON).has('app/layout.tsx', LAYOUT_TSX).has('lib/products.ts', PRODUCTS_TS).has('app/page.tsx', PAGE_TSX)
  .has('lib/stripe.ts', STRIPE_TS).has('app/api/checkout/route.ts', CHECKOUT_ROUTE).has('components/BuyButton.tsx', BUY_BUTTON)
  .has('lib/auth.ts', AUTH_TS).has('lib/db.ts', DB_TS).has('lib/schema.ts', SCHEMA_TS)
  .start()
  .prompt('Walk me through how this app works, and tell me if anything looks risky')
  .bash('ls', SRC_LISTING)
  .bash('git log --oneline -10', GIT_LOG)
  .read('package.json')
  .glob('**/*.{ts,tsx}', ['app/layout.tsx', 'app/page.tsx', 'app/api/checkout/route.ts', 'components/BuyButton.tsx', 'lib/products.ts', 'lib/stripe.ts', 'lib/auth.ts', 'lib/db.ts', 'lib/schema.ts'])
  .read('app/layout.tsx')
  .read('app/page.tsx')
  .read('components/BuyButton.tsx')
  .read('app/api/checkout/route.ts')
  .read('lib/stripe.ts')
  .read('lib/products.ts')
  .grep('process\\.env', ['lib/stripe.ts', 'lib/auth.ts', 'lib/db.ts'])
  .read('lib/auth.ts')
  .read('lib/db.ts')
  .read('lib/schema.ts')
  .grep('readSession', ['lib/auth.ts'])
  .bash('cat .env.example', 'STRIPE_SECRET_KEY=\nSESSION_SECRET=\nDATABASE_URL=')
  .bash('git status', 'On branch main\nnothing to commit, working tree clean')
  .bash('npm ls --depth=0', `shop@0.1.0 /Users/sam/shop\n├── drizzle-orm@0.45.1\n├── next@16.1.0\n├── pg@8.16.3\n├── react-dom@19.2.0\n├── react@19.2.0\n└── stripe@19.1.0`)
  .bash('npm audit', `found 0 vulnerabilities`)
  .grep('webhook', [])
  .stop()
  .prompt('You said there is no webhook. Add zod so the checkout body gets validated, at least')
  .bash('npm install zod', NPM_INSTALL_OUT)
  .read('app/api/checkout/route.ts')
  .edit('app/api/checkout/route.ts', `  const { productId, quantity } = (await req.json()) as { productId: string; quantity?: number }`, `  const parsed = Body.safeParse(await req.json())\n  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 })\n  const { productId, quantity } = parsed.data`)
  .edit('app/api/checkout/route.ts', `import { NextResponse } from 'next/server'`, `import { NextResponse } from 'next/server'\nimport { z } from 'zod'\n\nconst Body = z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).optional() })`)
  .bash('npx tsc --noEmit', '')
  .stop()
  .done()

export const SESSIONS: readonly BenchSession[] = [buildStripeApp, fixFailingTest, exploreCodebase]
