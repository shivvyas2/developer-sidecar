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
