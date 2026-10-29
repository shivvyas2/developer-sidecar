import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

const marks = (page: Page) => page.locator('.timeline__mark')
/** The timeline's "step N of M": M counts every step, prompts included. */
const stepLabel = (page: Page) => page.locator('.timeline__count')
const stepTotal = async (page: Page) => parseInt((await stepLabel(page).innerText()).replace(/^.* of /, ''), 10)
const readout = (page: Page) => page.getByRole('region', { name: 'Stage readout' })
const building = (page: Page, name: RegExp) => page.getByRole('list', { name: 'Buildings in the town' }).getByRole('button', { name })
/** The building list is for keyboards and screen readers, so it is used the way they would: focus, then Enter. */
const open = async (page: Page, name: RegExp) => { await building(page, name).focus(); await page.keyboard.press('Enter') }

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
  // while following live the recap above the stage holds the failed step's ask, so it shows once, not on its card too;
  // the turn has ended, so it is the AI recap's ask
  const next = page.locator('.detail__next')
  await expect(next).toHaveCount(1)
  await expect(next).toContainText('WHAT TO DO NEXT')
  await expect(next).toContainText('Fix the failing checks, fake edition')
  await expect(next).toContainText('/rewind')
})

test('a permission prompt raises the NEEDS YOU banner and marks the tab', async ({ page }) => {
  await page.goto(url())
  await expect(stepLabel(page)).toContainText('of 4')
  emit({ session_id: 'smoke-1', cwd: '/tmp/demo', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await expect(page.locator('.ds-strip', { hasText: 'NEEDS YOU' })).toContainText('Claude needs your permission to use Bash')
  await expect(page).toHaveTitle(/^\(waiting\)/)
})

test('the stage draws the town and the timeline holds every step', async ({ page }) => {
  await page.goto(url())
  await expect(stepLabel(page)).toContainText('of 4')
  await expect(page.getByRole('region', { name: 'Stage' }).locator('canvas.city__canvas')).toBeVisible()
  await expect(marks(page)).toHaveCount(4)
})

test('an older step shows the town as it was, and its card has the technical detail', async ({ page }) => {
  await page.goto(url())
  await marks(page).nth(1).click()
  await expect(page.locator('.timeline__replay')).toHaveText('REPLAY')
  await expect(stepLabel(page)).toContainText('step 2 of 4')
  await page.getByRole('button', { name: 'SHOW TECHNICAL' }).click()
  await expect(page.getByRole('button', { name: 'HIDE TECHNICAL' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to live' }).click()
  await expect(page.locator('.timeline__live')).toHaveText('LIVE')
})

test('the timeline steps through with the keyboard', async ({ page }) => {
  await page.goto(url())
  const strip = page.getByRole('group', { name: /Steps; use the arrow keys/ })
  await strip.focus()
  await strip.press('Home')
  await expect(stepLabel(page)).toContainText('step 1 of 4')
  await strip.press('ArrowRight')
  await expect(stepLabel(page)).toContainText('step 2 of 4')
  await strip.press('End')
  await expect(page.locator('.timeline__live')).toHaveText('LIVE')
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

/** Opens the bench session. It has 37 steps, or more once the live test below has added to it. */
async function openStripe(page: Page) {
  await page.goto(url())
  await page.locator('select.hdr__session').selectOption(STRIPE)
  await expect.poll(() => stepTotal(page)).toBeGreaterThanOrEqual(37)
}

test('a finished session ends on its newest step, with checks and status in plain words', async ({ page }) => {
  await openStripe(page)
  await expect(stepLabel(page)).toContainText('step 37 of 37')
  await expect(readout(page)).toContainText('037')
  await expect(readout(page)).toContainText('DONE')
  await expect(readout(page)).toContainText('MADE')
  await expect(readout(page)).toContainText('PASS')
  await expect(readout(page)).toContainText('ALL GOOD')
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
  await expect(stepLabel(page)).toContainText('of 41')
  await expect(readout(page)).toContainText('041', { timeout: 3000 })
  await expect(readout(page)).toContainText('DONE')
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
  await expect(page.locator('.timeline__replay')).toHaveText('REPLAY')
})

test('the town has the service and the data, and tapping a building opens its card', async ({ page }) => {
  await openStripe(page)
  await expect(building(page, /^Stripe: /)).toHaveCount(1)
  await open(page, /^Your data: /)
  const card = page.getByRole('region', { name: /^About The warehouse/ })
  await expect(card).toContainText('The warehouse keeps everything on labelled shelves')
  await card.getByRole('button', { name: 'Go deeper' }).click()
  await expect(card).toContainText('What it really is')
  await expect(card).toContainText('schema')
})

test('the basic session maps too, and its fake secret never shows', async ({ page }) => {
  await page.goto(`${url()}?tab=whiteboard`)
  await expect(page.locator('.board')).toContainText('Stripe')
  await expect(page.locator('.board')).not.toContainText('sk-live')
})

test('the timeline tells the session as a story: what you asked, a failure, and its fix', async ({ page }) => {
  await openStripe(page)
  await expect(page.locator('.timeline__asked').filter({ hasText: 'You asked: Add Stripe checkout' })).toHaveCount(1)
  await expect(page.locator('.timeline__mark[data-tone="failed"]')).toHaveCount(1)
  await expect(page.locator('.timeline__mark[data-tone="fixed"]')).toHaveCount(1)
})

test('the archive opens the GitHub guide with a request to copy', async ({ page }) => {
  const base = { session_id: 'e2e-git', cwd: '/Users/sam/notes' }
  const input = { command: 'git commit -m "first"' }
  emit({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'Save my work' })
  emit({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'toolu_e2e_git', tool_input: input })
  emit({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'toolu_e2e_git', tool_input: input, tool_response: { stdout: '[main 1a2b3c] first', stderr: '', interrupted: false } })
  emit({ ...base, hook_event_name: 'Stop' })
  await page.goto(url())
  await page.locator('select.hdr__session').selectOption('e2e-git')
  await open(page, /^Archive: /)
  const guide = page.getByRole('region', { name: 'Set up GitHub safely' })
  await expect(guide).toContainText('The project is a git repository')
  await expect(guide).toContainText('private GitHub repository')
  await expect(guide.getByRole('button', { name: 'Copy request' })).toBeVisible()
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
  // the ask is on screen once, on the recap, though the failed step's own card is pulled out below it;
  // the AI recap's ask, which knows the whole turn, replaces the rule-based one
  const next = page.locator('.detail__next')
  await expect(next).toHaveCount(1)
  await expect(recap.locator('.detail__next')).toHaveCount(1)
  await expect(next).toContainText('Fix the failing checks, fake edition')
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

/** The "Asked:" line of every recap request the fake claude command answered. */
const claudeCalls = () => readFileSync(process.env.SIDECAR_E2E_CALLS!, 'utf8').split('\n').filter(Boolean)

test('each turn that ended got one AI recap through the claude command, and the header counts its tokens', async ({ page }) => {
  await expect.poll(() => claudeCalls().filter((a) => a.startsWith('Add Stripe checkout so people can buy')).length).toBe(1)
  await expect.poll(() => claudeCalls().filter((a) => a.startsWith('Store each order in Postgres')).length).toBe(1)
  await expect.poll(() => claudeCalls().filter((a) => a.startsWith('Build a Next.js app that takes Stripe payments')).length).toBe(1)
  await page.goto(url())
  await expect(page.locator('.hdr__tokens-v')).not.toHaveText('0')
})

test('the card shows the AI recap of the last turn and what it means, and its term reaches the glossary', async ({ page }) => {
  await openStripe(page)
  const recap = page.getByRole('region', { name: 'Where things stand' })
  await expect(recap.locator('.recap__summary')).toContainText('Fake recap: Claude worked on')
  await expect(recap).toContainText('WHAT IT MEANS')
  await page.getByRole('tab', { name: 'Glossary' }).click()
  await expect(page.locator('main')).toContainText('Fake term')
})

test('less motion can be chosen in Settings, and it is remembered', async ({ page }) => {
  await page.goto(url())
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: 'Less motion' }).check()
  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('radio', { name: 'Less motion' })).toBeChecked()
  await page.getByRole('radio', { name: 'Follow my computer' }).check()
})
