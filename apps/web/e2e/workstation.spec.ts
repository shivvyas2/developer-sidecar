import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const url = () => process.env.SIDECAR_E2E_URL!
let errors: string[] = []

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
})
test.afterEach(() => { expect(errors).toEqual([]) })

const cards = (page: Page) => page.locator('button.ds-step')

/** Sends one hook payload through the plugin's emit script, as Claude Code would. */
function emit(payload: object) {
  const script = resolve(import.meta.dirname, '../../../plugin/dist/emit.cjs')
  const env = { ...process.env, SIDECAR_HOME: process.env.SIDECAR_E2E_HOME! }
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(payload), env, encoding: 'utf8', timeout: 15000 })
  if (r.status !== 0) throw new Error(`emit exited ${r.status}: ${r.stderr}`)
}

test('the failed test step says what to do next', async ({ page }) => {
  await page.goto(url())
  const next = page.locator('.detail__next')
  await expect(next).toContainText('WHAT TO DO NEXT')
  await expect(next).toContainText('npm test')
  await expect(next).toContainText('/rewind')
})

test('a permission prompt raises the NEEDS YOU banner and marks the tab', async ({ page }) => {
  await page.goto(url())
  await expect(cards(page)).toHaveCount(4)
  emit({ session_id: 'smoke-1', cwd: '/tmp/demo', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await expect(page.locator('.ds-strip', { hasText: 'NEEDS YOU' })).toContainText('Claude needs your permission to use Bash')
  await expect(page).toHaveTitle(/^\(waiting\)/)
})

test('the stage draws a scene and the drawer holds every step', async ({ page }) => {
  await page.goto(url())
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'Stage' }).locator('svg').first()).toBeVisible()
})

test('an older card shows its scene and its technical detail', async ({ page }) => {
  await page.goto(url())
  const second = cards(page).nth(1)
  await second.click()
  await expect(second).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'SHOW TECHNICAL' }).click()
  await expect(page.getByRole('button', { name: 'HIDE TECHNICAL' })).toBeVisible()
})

test('the replay scrubber moves through the steps', async ({ page }) => {
  await page.goto(url())
  const ruler = page.getByRole('slider', { name: 'Replay position' })
  await ruler.focus()
  await ruler.press('Home')
  await expect(ruler).toHaveAttribute('aria-valuetext', /Step 1 of 4/)
  await ruler.press('ArrowRight')
  await expect(ruler).toHaveAttribute('aria-valuetext', /Step 2 of 4/)
})

test('the theme toggle forces dark and survives a reload', async ({ page }) => {
  await page.goto(url())
  const toggle = page.getByRole('button', { name: /^Theme:/ })
  for (let i = 0; i < 3 && (await page.locator('html').getAttribute('data-theme')) !== 'dark'; i++) await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('the kit gallery renders', async ({ page }) => {
  await page.goto(`${url()}#/kit`)
  await expect(page.locator('svg').first()).toBeVisible()
  // The kit shows every piece in its light half and its dark half.
  await expect(page.getByLabel('Terminal renderer preview')).toHaveCount(2)
  await expect(page.getByLabel('Terminal renderer preview').first()).toBeVisible()
})

test('the header carries the mark and the intro drives off by itself', async ({ page }) => {
  await page.goto(url())
  await expect(page.locator('.hdr .sc-logo')).toBeVisible()
  // Automation never sees the intro unless it is asked for.
  await expect(page.locator('.intro')).toHaveCount(0)
  await page.goto(`${url()}?intro=1`)
  await expect(page.locator('.intro .sc-logo--driving')).toBeVisible()
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 6000 })
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml')
})
