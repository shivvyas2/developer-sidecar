import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// Its own server on an empty home, so the workstation has never seen a session. Recaps are on, through
// the fake claude command, to prove the demo never costs a call.
const ROOT = resolve(import.meta.dirname, '../../..')
let home = ''
let base = ''
let token = ''
let server: ChildProcess | null = null
const calls = () => join(home, 'claude-calls.log')
let errors: string[] = []

const freePort = () => new Promise<number>((done) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address() as AddressInfo; s.close(() => done(port)) })
})
const env = () => {
  const { SIDECAR_EXPLAINER: _off, ...rest } = process.env
  return { ...rest, SIDECAR_HOME: home, ANTHROPIC_API_KEY: '', SIDECAR_E2E_CALLS: calls(), PATH: `${join(ROOT, 'apps/web/e2e/fake-claude')}:${process.env.PATH ?? ''}` }
}
const api = async <T,>(path: string) => (await (await fetch(`${base}${path}`, { headers: { 'x-sidecar-token': token } })).json()) as T
function emit(payload: object) {
  const r = spawnSync(process.execPath, [join(ROOT, 'plugin/dist/emit.cjs')], { input: JSON.stringify(payload), env: env(), encoding: 'utf8', timeout: 15000 })
  if (r.status !== 0) throw new Error(`emit exited ${r.status}: ${r.stderr}`)
}
const stepLabel = (page: Page) => page.locator('.ds-drawer .ds-label')

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'sidecar-first-run-'))
  const port = await freePort()
  server = spawn(process.execPath, [join(ROOT, 'plugin/dist/server.cjs')], { env: { ...env(), SIDECAR_PORT: String(port) }, stdio: 'ignore' })
  for (let i = 0; i < 100 && !(existsSync(join(home, 'port')) && existsSync(join(home, 'token'))); i++) await new Promise((r) => setTimeout(r, 100))
  base = `http://127.0.0.1:${readFileSync(join(home, 'port'), 'utf8').trim()}`
  token = readFileSync(join(home, 'token'), 'utf8').trim()
  for (let i = 0; i < 100 && (await api<{ status: string }>('/api/explainer')).status !== 'ready'; i++) await new Promise((r) => setTimeout(r, 100))
})
test.afterAll(() => { server?.kill('SIGTERM') })
test.beforeEach(async ({ page }) => {
  errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
})
test.afterEach(() => { expect(errors).toEqual([]) })

test('with no sessions, the Stage plays the sample, marked SAMPLE, and it costs nothing', async ({ page }) => {
  await page.goto(`${base}/`)
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toContainText('This is a sample session')
  await expect(page.getByRole('region', { name: 'Stage' }).locator('.sk-status-strip')).toContainText('SAMPLE')
  const first = parseInt(await stepLabel(page).innerText(), 10)
  await expect.poll(async () => parseInt(await stepLabel(page).innerText(), 10), { timeout: 8000 }).toBeGreaterThan(first)
  expect(await api<unknown[]>('/api/sessions')).toEqual([])
  expect((await api<{ tokens: { input: number; output: number } }>('/api/explainer')).tokens).toEqual({ input: 0, output: 0 })
  expect(existsSync(calls())).toBe(false)
})

test('tapping a place says what it is, and the key lists everything', async ({ page }) => {
  await page.goto(`${base}/`)
  await page.getByRole('region', { name: 'Stage' }).locator('.sk-place--app').first().click({ force: true })
  await expect(page.locator('.legend__hit')).toContainText('Your app.')
  await page.getByRole('button', { name: 'WHAT AM I LOOKING AT?' }).click()
  await expect(page.locator('.legend__row')).toHaveCount(11)
  await expect(page.locator('.legend__row[data-on]')).toContainText('Your app')
})

test('the demo also runs with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${base}/`)
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Stage' }).locator('svg').first()).toBeVisible()
})

test('the first real session replaces the demo', async ({ page }) => {
  await page.goto(`${base}/`)
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toBeVisible()
  emit({ session_id: 'real-1', cwd: '/Users/sam/blog', hook_event_name: 'UserPromptSubmit', prompt: 'Add an about page' })
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toHaveCount(0)
  await expect(page.locator('.ds-drawer')).toContainText('Add an about page')
  await expect(page.getByRole('region', { name: 'Stage' }).locator('.sk-status-strip')).not.toContainText('SAMPLE')
})
