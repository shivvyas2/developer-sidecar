import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { callsLog, emit, freePort, ROOT, serverOf, sidecarEnv, untilRecapsReady } from './server'

// Its own server on an empty home, so the workstation has never seen a session. Recaps are on, through
// the fake claude command, to prove the demo never costs a call.
let home = ''
let base = ''
let token = ''
let server: ChildProcess | null = null
const calls = () => callsLog(home)
let errors: string[] = []

const api = async <T,>(path: string) => (await (await fetch(`${base}${path}`, { headers: { 'x-sidecar-token': token } })).json()) as T
const stepLabel = (page: Page) => page.locator('.ds-drawer .ds-label')

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'sidecar-first-run-'))
  const port = await freePort()
  server = spawn(process.execPath, [join(ROOT, 'plugin/dist/server.cjs')], { env: { ...sidecarEnv(home), SIDECAR_PORT: String(port) }, stdio: 'ignore' })
  await untilRecapsReady(home)
  const up = serverOf(home)
  base = up.url
  token = up.token
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

test('leaving the Stage and coming back picks the sample up where it was', async ({ page }) => {
  await page.goto(`${base}/`)
  await expect.poll(async () => parseInt(await stepLabel(page).innerText(), 10), { timeout: 10000 }).toBeGreaterThanOrEqual(3)
  const before = parseInt(await stepLabel(page).innerText(), 10)
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Stage' }).click()
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toBeVisible()
  expect(parseInt(await stepLabel(page).innerText(), 10)).toBeGreaterThanOrEqual(before)
})

test('tapping a place says what it is, and the key lists everything', async ({ page }) => {
  await page.goto(`${base}/`)
  // A real press and release on Your app while the scene redraws it: the shape under the pointer is
  // replaced between the two, which is when a tap used to land on nothing.
  const app = page.getByRole('region', { name: 'Stage' }).locator('.sk-place--app').first()
  const box = (await app.boundingBox())!
  const pressed = await app.elementHandle()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForFunction((el) => !el?.isConnected, pressed)
  await page.mouse.up()
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
  emit(home, { session_id: 'real-1', cwd: '/Users/sam/blog', hook_event_name: 'UserPromptSubmit', prompt: 'Add an about page' })
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toHaveCount(0)
  await expect(page.locator('.ds-drawer')).toContainText('Add an about page')
  await expect(page.getByRole('region', { name: 'Stage' }).locator('.sk-status-strip')).not.toContainText('SAMPLE')
})
