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
/** The drawer front's "N STEPS": every step, including prompts (chapter headers) and steps inside folded beats. */
const stepLabel = (page: Page) => page.locator('.ds-drawer .ds-label')

/** Sends one hook payload through the plugin's emit script, as Claude Code would. */
function emit(payload: object) {
  const script = resolve(import.meta.dirname, '../../../plugin/dist/emit.cjs')
  const env = { ...process.env, SIDECAR_HOME: process.env.SIDECAR_E2E_HOME! }
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(payload), env, encoding: 'utf8', timeout: 15000 })
  if (r.status !== 0) throw new Error(`emit exited ${r.status}: ${r.stderr}`)
}

test('the failed test step says what to do next', async ({ page }) => {
  await page.goto(url())
  await page.locator('select.hdr__session').selectOption('smoke-1')
  const next = page.locator('.ds-pulled .detail__next')
  await expect(next).toContainText('WHAT TO DO NEXT')
  await expect(next).toContainText('npm test')
  await expect(next).toContainText('/rewind')
})

test('a permission prompt raises the NEEDS YOU banner and marks the tab', async ({ page }) => {
  await page.goto(url())
  await expect(stepLabel(page)).toHaveText('4 STEPS')
  emit({ session_id: 'smoke-1', cwd: '/tmp/demo', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await expect(page.locator('.ds-strip', { hasText: 'NEEDS YOU' })).toContainText('Claude needs your permission to use Bash')
  await expect(page).toHaveTitle(/^\(waiting\)/)
})

test('the stage draws a scene and the drawer holds every step', async ({ page }) => {
  await page.goto(url())
  await expect(stepLabel(page)).toHaveText('4 STEPS')
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

const STRIPE = 'bench-build-stripe-app'
const strip = (page: Page) => page.getByRole('region', { name: 'Stage' }).locator('.sk-status-strip')

/** Opens the bench session. It has 37 steps, or more once the live test below has added to it. */
async function openStripe(page: Page) {
  await page.goto(url())
  await page.locator('select.hdr__session').selectOption(STRIPE)
  await expect.poll(async () => parseInt(await stepLabel(page).innerText(), 10)).toBeGreaterThanOrEqual(37)
}

test('a finished session ends on its newest step, with checks and status in plain words', async ({ page }) => {
  await openStripe(page)
  await expect(stepLabel(page)).toHaveText('37 STEPS')
  await expect(strip(page)).toContainText('STEP 037')
  await expect(strip(page)).toContainText('DONE')
  const frame = page.getByRole('region', { name: 'Stage' }).locator('.sk-readout')
  await expect(frame).toContainText('MADE')
  await expect(frame).toContainText('CHECKS')
  await expect(frame).toContainText('PASS')
  await expect(page.getByRole('region', { name: 'Stage' })).toContainText('ALL GOOD')
  await expect(page.getByRole('region', { name: 'Stage' })).not.toContainText('SHEET')
  await expect(cards(page).first()).toContainText('CHECKS')
  await expect(cards(page).first()).not.toContainText('npx vitest')
})

test('a burst followed by Stop ends on the newest step within a few seconds (it lagged about 14 s before)', async ({ page }) => {
  await openStripe(page)
  const base = { session_id: STRIPE, cwd: '/Users/sam/shop' }
  emit({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Tidy up and check again' })
  for (const [i, file] of ['a.ts', 'b.ts', 'c.ts'].entries()) {
    const id = `toolu_e2e_live_${i}`
    const input = { file_path: `/Users/sam/shop/lib/${file}`, content: 'export {}' }
    emit({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_use_id: id, tool_input: input })
    emit({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_use_id: id, tool_input: input, tool_response: { type: 'create', filePath: input.file_path, content: 'export {}' } })
  }
  emit({ ...base, hook_event_name: 'Stop' })
  await expect(stepLabel(page)).toHaveText('41 STEPS')
  await expect(strip(page)).toContainText('STEP 041', { timeout: 3000 })
  await expect(strip(page)).toContainText('DONE')
})

test('the Whiteboard maps what the session built, and a step link opens the Stage', async ({ page }) => {
  await openStripe(page)
  await page.getByRole('tab', { name: 'Whiteboard' }).click()
  const board = page.locator('.board')
  for (const section of ['Pages and screens', 'Behind the scenes', 'Your data', 'Outside services', 'Secret settings', 'Checks', 'Building blocks']) {
    await expect(board.getByRole('region', { name: section })).toBeVisible()
  }
  await expect(board.getByRole('region', { name: 'Outside services' })).toContainText('Stripe')
  await expect(board.getByRole('region', { name: 'Your data' })).toContainText('Orders table')
  const checkout = board.getByRole('button', { name: /Checkout/ }).first()
  await checkout.click()
  await expect(checkout).toHaveAttribute('aria-expanded', 'true')
  await expect(board).toContainText('app/api/checkout/route.ts')
  await board.locator('.board__step').first().click()
  await expect(page.getByRole('tab', { name: 'Stage' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.ds-step[aria-pressed="true"]')).toHaveCount(1)
})

test('the stage town names the service and the table', async ({ page }) => {
  await openStripe(page)
  const stage = page.getByRole('region', { name: 'Stage' })
  await expect(stage).toContainText('STRIPE')
  await expect(stage).toContainText('ORDERS')
})

test('the basic session maps too, and its fake secret never shows', async ({ page }) => {
  await page.goto(`${url()}?tab=whiteboard`)
  await expect(page.locator('.board')).toContainText('Stripe')
  await expect(page.locator('.board')).not.toContainText('sk-live')
})

test('the drawer tells the session as a story: chapters, a fixed problem, folded reading', async ({ page }) => {
  await openStripe(page)
  const drawer = page.locator('.ds-drawer')
  const chapters = drawer.locator('.story__chapter')
  await expect(chapters.first()).toContainText('YOU ASKED')
  await expect(drawer.getByRole('region', { name: /You asked: Add Stripe checkout/ })).toContainText('fixed 1 problem')
  await expect(drawer.locator('.ds-step__badge', { hasText: 'FIXED' })).toHaveCount(1)
  await expect(drawer.locator('.ds-step__badge', { hasText: 'PROBLEM' })).toHaveCount(1)
  // a run of reading is one folded beat until opened
  const fold = drawer.locator('.story__fold').filter({ hasText: /^Read \d+ files?/ }).last()
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(fold.locator('xpath=..').locator('button.ds-step').first()).toBeVisible()
  // folds stay folded while following live; scrubbing to a step inside one opens it
  await page.getByRole('button', { name: 'LIVE' }).click()
  const edits = drawer.locator('.story__fold').filter({ hasText: /^Changed page\.tsx 3 times/ })
  await expect(edits).toHaveAttribute('aria-expanded', 'false')
  const ruler = page.getByRole('slider', { name: 'Replay position' })
  await ruler.focus()
  await ruler.press('Home')
  for (let i = 0; i < 13; i++) await ruler.press('ArrowRight')
  await expect(edits).toHaveAttribute('aria-expanded', 'true')
  // folded again by hand, moving to the next step inside it opens it again, so the picked card shows
  await edits.click()
  await expect(edits).toHaveAttribute('aria-expanded', 'false')
  await ruler.press('ArrowRight')
  await expect(edits).toHaveAttribute('aria-expanded', 'true')
  await expect(edits.locator('xpath=..').locator('button.ds-step[aria-pressed="true"]')).toHaveCount(1)
  // the prompt header picks the prompt step
  await drawer.locator('.story__head').last().click()
  await expect(drawer.locator('.story__head').last()).toHaveAttribute('aria-pressed', 'true')
})

test('the basic session opens on where things stand: a failure still in the way, with the ask', async ({ page }) => {
  await page.goto(url())
  await page.locator('select.hdr__session').selectOption('smoke-1')
  const recap = page.getByRole('region', { name: 'Where things stand' })
  // the permission test above left smoke-1 waiting on you, which the card says first
  await expect(recap).toContainText('CLAUDE NEEDS YOU')
  emit({ session_id: 'smoke-1', cwd: '/tmp/demo', hook_event_name: 'Stop' })
  await expect(recap).toContainText('WHERE THINGS STAND')
  await expect(recap).toContainText('Something still needs a fix.')
  await expect(recap).toContainText('Checks fail')
  await expect(recap.getByRole('list', { name: 'Made or changed' })).toContainText('Checkout')
  await expect(recap.locator('.detail__next')).toContainText('npm test')
})

test('a dev server that is up gets an Open your app button', async ({ page }) => {
  const base = { session_id: 'e2e-dev', cwd: '/Users/sam/site' }
  const input = { command: 'npm run dev' }
  const stdout = '> site@0.1.0 dev\n> next dev\n\n   - Local:        http://localhost:3000\n   - Network:      http://192.168.1.20:3000\n ✓ Ready'
  emit({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Start the site so I can try it' })
  emit({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'toolu_e2e_dev', tool_input: input })
  emit({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'toolu_e2e_dev', tool_input: input, tool_response: { stdout, stderr: '', interrupted: false } })
  emit({ ...base, hook_event_name: 'Stop' })
  await page.goto(url())
  await page.locator('select.hdr__session').selectOption('e2e-dev')
  const open = page.getByRole('link', { name: /OPEN YOUR APP/ })
  await expect(open).toHaveAttribute('href', 'http://localhost:3000')
  await expect(open).toHaveAttribute('target', '_blank')
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer')
})
