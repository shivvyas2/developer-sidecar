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
const stepTotal = async (page: Page) => parseInt((await page.locator('.timeline__count').innerText()).replace(/^.* of /, ''), 10)
const readout = (page: Page) => page.getByRole('region', { name: 'Stage readout' })

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
  await expect(readout(page)).toContainText('SAMPLE')
  const first = await stepTotal(page)
  await expect.poll(() => stepTotal(page), { timeout: 8000 }).toBeGreaterThan(first)
  expect(await api<unknown[]>('/api/sessions')).toEqual([])
  expect((await api<{ tokens: { input: number; output: number } }>('/api/explainer')).tokens).toEqual({ input: 0, output: 0 })
  expect(existsSync(calls())).toBe(false)
})

test('leaving the Stage and coming back picks the sample up where it was', async ({ page }) => {
  await page.goto(`${base}/`)
  await expect.poll(() => stepTotal(page), { timeout: 10000 }).toBeGreaterThanOrEqual(3)
  const before = await stepTotal(page)
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Stage' }).click()
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toBeVisible()
  expect(await stepTotal(page)).toBeGreaterThanOrEqual(before)
})

test('every building in the sample can be opened from the keyboard, and says what it is', async ({ page }) => {
  await page.goto(`${base}/`)
  const list = page.getByRole('list', { name: 'Buildings in the town' })
  await expect.poll(() => list.getByRole('button').count(), { timeout: 10000 }).toBeGreaterThan(1)
  await list.getByRole('button').first().focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.concept')).toBeVisible()
  await expect(page.locator('.concept__analogy')).not.toBeEmpty()
})

test('the demo also runs with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${base}/`)
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Stage' }).locator('canvas.city__canvas')).toBeVisible()
})

test('the first real session replaces the demo', async ({ page }) => {
  await page.goto(`${base}/`)
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toBeVisible()
  emit(home, { session_id: 'real-1', cwd: '/Users/sam/blog', hook_event_name: 'UserPromptSubmit', prompt: 'Add an about page' })
  await expect(page.locator('.ds-strip', { hasText: 'SAMPLE' })).toHaveCount(0)
  await expect(page.locator('.timeline__asked')).toContainText('Add an about page')
  await expect(readout(page)).not.toContainText('SAMPLE')
})
