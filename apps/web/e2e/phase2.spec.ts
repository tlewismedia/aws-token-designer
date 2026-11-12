// Phase 2 UI E2E smoke (issue #26) against the deployed `dev` backend.
//
// The journey mirrors docs/TESTING.md's manual checklist:
//   logged out → login → upload → add → print → remove → re-add → clear →
//   delete → logout, plus a registration pass with a unique email.
//
// Prerequisites (documented in docs/TESTING.md):
//   - the dev stack is applied and reachable,
//   - apps/web/.env.local points at it,
//   - the seeded user exists (E2E_EMAIL / E2E_PASSWORD override the default),
//   - AWS credentials are available if test users should be deleted.
//
// Re-runs are idempotent: the sheet is cleared and any `e2e-` image left by an
// earlier failed run is deleted before the journey starts. The image created
// by this run is deleted by the journey itself.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    /** Count of `window.print()` calls, stubbed via addInitScript. */
    __e2ePrintCalls?: number
  }
}

const E2E_EMAIL = process.env.E2E_EMAIL ?? 'dev-user@example.com'
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'Test1234!'

/** Unique-name prefix so a re-run can clean up after a failed run. */
const IMAGE_PREFIX = 'e2e-'
const FIXTURE = fileURLToPath(new URL('./fixtures/token.png', import.meta.url))

const createdEmails: string[] = []

function readEnvLocal(key: string): string | undefined {
  try {
    const path = fileURLToPath(new URL('../.env.local', import.meta.url))
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (match?.[1] === key) {
        return match[2].replace(/^['"]|['"]$/g, '') || undefined
      }
    }
  } catch {
    // .env.local is optional here: the journey itself only needs the dev
    // server, and the pool id is only used for best-effort user cleanup.
  }
  return undefined
}

/** Sheet count from the builder: one `.token` tile per entry in `sheet.images`. */
async function readSheetCount(page: Page): Promise<number> {
  return page.locator('.image-grid .token').count()
}

async function expectSheetCount(page: Page, expected: number): Promise<void> {
  await expect.poll(() => readSheetCount(page)).toBe(expected)
}

/**
 * Wait for a successful mutation under `/api/...`. The sheet mutations update
 * optimistically, so asserting only the count could pass before the server
 * rejects the change; waiting on the response makes the smoke fail when the
 * API breaks.
 */
function waitForApi(page: Page, method: string, pathPart: string) {
  return page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname
    return (
      response.request().method() === method &&
      path.startsWith(`/api${pathPart}`) &&
      response.ok()
    )
  })
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Password').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.image-grid')).toBeVisible()
}

test.afterAll(() => {
  const poolId = process.env.E2E_USER_POOL_ID ?? readEnvLocal('VITE_COGNITO_USER_POOL_ID')
  const region = process.env.AWS_REGION ?? readEnvLocal('VITE_AWS_REGION') ?? 'us-west-2'
  if (!poolId) {
    console.warn(
      'e2e: E2E_USER_POOL_ID / VITE_COGNITO_USER_POOL_ID not set — leaving test users behind',
    )
    return
  }
  for (const email of createdEmails) {
    try {
      execFileSync(
        'aws',
        ['cognito-idp', 'admin-delete-user', '--user-pool-id', poolId, '--username', email, '--region', region],
        { stdio: 'pipe' },
      )
      console.log(`e2e: deleted Cognito test user ${email}`)
    } catch (err) {
      // Best effort: the API profile/sheet items for that sub remain in
      // DynamoDB even after the Cognito user is gone (documented).
      console.warn(`e2e: could not delete Cognito test user ${email}: ${String(err)}`)
    }
  }
})

test.describe('Phase 2 UI smoke (dev backend)', () => {
  test('logged out, then the full builder journey — login, upload, add, print, remove, clear, delete, logout', async ({
    page,
  }) => {
    // Stub window.print before the app boots so headless Chromium never opens
    // a print dialog; the Print button itself is still gated on thumbnails.
    await page.addInitScript(() => {
      window.__e2ePrintCalls = 0
      window.print = () => {
        window.__e2ePrintCalls = (window.__e2ePrintCalls ?? 0) + 1
      }
    })

    // The port self-hosts fonts and keeps purchases disabled, so the browser
    // must never request Google Fonts or Stripe.
    const externalFontRequests: string[] = []
    const stripeRequests: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) externalFontRequests.push(url)
      if (/api\.stripe\.com|js\.stripe\.com/.test(url)) stripeRequests.push(url)
      if (
        request.method() === 'POST' &&
        new URL(url).pathname === '/api/checkout/session'
      ) {
        stripeRequests.push(url)
      }
    })

    // 1. Logged-out promotion page, protected route redirect.
    await page.goto('/')
    await expect(page.getByText(/fastest, easiest way to create game tokens/i)).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()

    // 2. Login as the seeded dev user; navbar credits come from GET /me.
    await signIn(page)
    await expect(page.locator('.credit-amount')).toHaveText(/^\d+$/)

    // Make the run idempotent: empty the sheet and delete images left behind
    // by a previous failed run (unique prefix), without assuming a pristine
    // gallery.
    const clearButton = page.getByRole('button', { name: /clear/i })
    if (await clearButton.isEnabled()) {
      const cleared = waitForApi(page, 'PATCH', '/sheets/')
      await clearButton.click()
      await cleared
      await expectSheetCount(page, 0)
    }

    const leftoverItems = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('img', { name: new RegExp(`^${IMAGE_PREFIX}`) }) })
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const remaining = await leftoverItems.count()
      if (remaining === 0) break
      page.once('dialog', (dialog) => void dialog.accept())
      await leftoverItems.first().getByRole('button', { name: 'Delete image' }).click()
      await expect(leftoverItems).toHaveCount(remaining - 1)
    }

    // 3. Upload a PNG; the thumbnail appears in the gallery.
    const imageName = `${IMAGE_PREFIX}${Date.now()}`
    await page.getByRole('button', { name: /Upload/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Upload Image' })
    await expect(dialog).toBeVisible()
    await dialog.locator('input[type=file]').setInputFiles(FIXTURE)
    await dialog.getByLabel('Name *').fill(imageName)
    await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
    // The ported form keeps the source success state instead of auto-closing.
    await expect(dialog.getByText('Image uploaded successfully!')).toBeVisible({
      timeout: 60_000,
    })
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
    await expect(dialog).toBeHidden()

    const figure = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('img', { name: imageName }) })
    await expect(figure).toBeVisible({ timeout: 60_000 })
    const thumbnail = page.getByRole('img', { name: imageName })
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true)

    // 4. Add the image to the sheet; the count rises.
    const addButton = figure.getByRole('button', { name: 'Add to sheet' })
    await expect(addButton).toBeEnabled()
    const added = waitForApi(page, 'POST', '/sheets/')
    await addButton.click()
    const addBody = (await (await added).json()) as { sheet: { images: string[] } }
    expect(addBody.sheet.images).toHaveLength(1)
    await expectSheetCount(page, 1)

    // 5. Print is gated on loaded thumbnails; the stub records the call.
    const printButton = page.getByRole('button', { name: 'Print', exact: true })
    await expect(printButton).toBeEnabled({ timeout: 60_000 })
    await printButton.click()
    await expect.poll(() => page.evaluate(() => window.__e2ePrintCalls ?? 0)).toBe(1)

    // The print stylesheet sizes `.printable` to 7.5in × 10in (720 × 960 CSS
    // px), keeps all 63 cells, and hides the navbar/library/sheet chrome.
    await page.emulateMedia({ media: 'print' })
    const printableBox = await page.locator('.printable').boundingBox()
    expect(Math.round(printableBox?.width ?? 0)).toBe(720)
    expect(Math.round(printableBox?.height ?? 0)).toBe(960)
    await expect(page.locator('.image-grid .token, .image-grid .empty-token')).toHaveCount(63)
    const visibility = (selector: string) =>
      page.locator(selector).evaluate((element) => getComputedStyle(element).visibility)
    expect(await visibility('.navbar')).toBe('hidden')
    expect(await visibility('.library')).toBe('hidden')
    expect(await visibility('.sheet-header')).toBe('hidden')
    expect(await visibility('.printable')).toBe('visible')
    await page.emulateMedia({ media: 'screen' })

    // 6. Remove the token by clicking its ×; the count falls.
    const removed = waitForApi(page, 'DELETE', '/sheets/')
    await page.getByRole('button', { name: 'Remove token 1' }).click()
    const removeBody = (await (await removed).json()) as { sheet: { images: string[] } }
    expect(removeBody.sheet.images).toHaveLength(0)
    await expectSheetCount(page, 0)

    // 7. Add again, then Clear empties the sheet.
    const reAdded = waitForApi(page, 'POST', '/sheets/')
    await addButton.click()
    const reAddBody = (await (await reAdded).json()) as { sheet: { images: string[] } }
    expect(reAddBody.sheet.images).toHaveLength(1)
    await expectSheetCount(page, 1)
    const clearedAgain = waitForApi(page, 'PATCH', '/sheets/')
    await page.getByRole('button', { name: /clear/i }).click()
    const clearBody = (await (await clearedAgain).json()) as { sheet: { images: string[] } }
    expect(clearBody.sheet.images).toHaveLength(0)
    await expectSheetCount(page, 0)
    // Clear stays available on an empty sheet (source behavior).
    await expect(page.getByRole('button', { name: /clear/i })).toBeEnabled()

    // 8. Delete the image; it leaves the gallery.
    const deleted = waitForApi(page, 'DELETE', '/images/')
    page.once('dialog', (dialog) => void dialog.accept())
    await figure.getByRole('button', { name: 'Delete image' }).click()
    await deleted
    await expect(figure).toHaveCount(0)

    // 9. Buy Credits is inert: source page shell, no checkout request, and no
    // Stripe.js or direct Stripe API traffic.
    const stripeRequestsBefore = stripeRequests.length
    await page.goto('/buy-credits')
    await expect(page.getByRole('heading', { name: 'Buy Credits' })).toBeVisible()
    await expect(page.getByText('Credit purchasing is coming soon.')).toBeVisible()
    await expect(page.locator('#checkout-container button')).toHaveCount(0)
    expect(stripeRequests).toHaveLength(stripeRequestsBefore)

    // 10. Logout returns to the promotion page.
    await page.goto('/')
    await expect(page.locator('.image-grid')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Logout' }).click()
    await expect(page.getByText(/fastest, easiest way to create game tokens/i)).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await expect(page.locator('.credit-amount')).toHaveCount(0)

    expect(externalFontRequests).toEqual([])
    expect(stripeRequests).toEqual([])
  })

  test('registration auto-confirms and lands in the builder', async ({ page }) => {
    const email = `e2e+${Date.now()}@example.com`
    const password = 'Test1234!'
    createdEmails.push(email)

    await page.goto('/register')
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Register', exact: true }).click()

    // The pre-sign-up trigger auto-confirms, so signUp + signIn land on `/`
    // with the lazily bootstrapped profile (10 credits + default sheet).
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Registration successful.')).toBeVisible()
    await expect(page.locator('.image-grid')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.credit-amount')).toHaveText('10', { timeout: 60_000 })

    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Logout' }).click()
    await expect(page.getByText(/fastest, easiest way to create game tokens/i)).toBeVisible()
  })
})
