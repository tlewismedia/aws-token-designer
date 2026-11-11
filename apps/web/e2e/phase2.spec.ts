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

/** Sheet count from the builder (`Count: N/63`). */
async function readSheetCount(page: Page): Promise<number> {
  const text = await page.locator('.sheet-info p').first().textContent()
  const match = text?.match(/Count:\s*(\d+)\s*\/\s*63/)
  if (!match) throw new Error(`Could not read the sheet count from "${text ?? ''}"`)
  return Number(match[1])
}

async function expectSheetCount(page: Page, expected: number): Promise<void> {
  await expect.poll(() => readSheetCount(page)).toBe(expected)
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Password').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Token Sheet' })).toBeVisible()
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

    // 1. Logged-out marketing page, protected route redirect.
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'AWS Token Designer' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    // 2. Login as the seeded dev user; navbar credits come from GET /me.
    await signIn(page)
    await expect(page.getByText(/^\d+ credits$/)).toBeVisible()

    // Make the run idempotent: empty the sheet and delete images left behind
    // by a previous failed run (unique prefix), without assuming a pristine
    // gallery.
    const clearButton = page.getByRole('button', { name: 'Clear', exact: true })
    if (await clearButton.isEnabled()) {
      await clearButton.click()
      await expectSheetCount(page, 0)
    }

    const leftoverFigures = page.getByRole('figure').filter({ hasText: IMAGE_PREFIX })
    for (let attempt = 0; attempt < 20 && (await leftoverFigures.count()) > 0; attempt += 1) {
      const figure = leftoverFigures.first()
      page.once('dialog', (dialog) => void dialog.accept())
      await figure.getByRole('button', { name: 'Delete' }).click()
      await expect(figure).toHaveCount(0)
    }

    // 3. Upload a PNG; the thumbnail appears in the gallery.
    const imageName = `${IMAGE_PREFIX}${Date.now()}`
    await page.getByRole('button', { name: /Upload/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Upload an image' })
    await expect(dialog).toBeVisible()
    await dialog.locator('input[type=file]').setInputFiles(FIXTURE)
    await dialog.getByLabel('Name', { exact: true }).fill(imageName)
    await dialog.getByRole('button', { name: 'Upload', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 60_000 })

    const figure = page.getByRole('figure').filter({ hasText: imageName })
    await expect(figure).toBeVisible({ timeout: 60_000 })
    const thumbnail = page.getByRole('img', { name: imageName })
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true)

    // 4. Add the image to the sheet; the count rises.
    const addButton = figure.getByRole('button', { name: 'Add' })
    await expect(addButton).toBeEnabled()
    await addButton.click()
    await expectSheetCount(page, 1)

    // 5. Print is gated on loaded thumbnails; the stub records the call.
    const printButton = page.getByRole('button', { name: 'Print', exact: true })
    await expect(printButton).toBeEnabled({ timeout: 60_000 })
    await printButton.click()
    await expect.poll(() => page.evaluate(() => window.__e2ePrintCalls ?? 0)).toBe(1)

    // 6. Remove the token by clicking its ×; the count falls.
    await page.getByRole('button', { name: 'Remove token 1' }).click()
    await expectSheetCount(page, 0)

    // 7. Add again, then Clear empties the sheet.
    await addButton.click()
    await expectSheetCount(page, 1)
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expectSheetCount(page, 0)
    await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeDisabled()

    // 8. Delete the image; it leaves the gallery.
    page.once('dialog', (dialog) => void dialog.accept())
    await figure.getByRole('button', { name: 'Delete' }).click()
    await expect(figure).toHaveCount(0)

    // 9. Logout returns to the marketing page.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'AWS Token Designer' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText(/^\d+ credits$/)).toHaveCount(0)
  })

  test('registration auto-confirms and lands in the builder', async ({ page }) => {
    const email = `e2e+${Date.now()}@example.com`
    const password = 'Test1234!'
    createdEmails.push(email)

    await page.goto('/register')
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()

    // The pre-sign-up trigger auto-confirms, so signUp + signIn land on `/`
    // with the lazily bootstrapped profile (10 credits + default sheet).
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Token Sheet' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/^\d+ credits$/)).toHaveText('10 credits', { timeout: 60_000 })

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'AWS Token Designer' })).toBeVisible()
  })
})
