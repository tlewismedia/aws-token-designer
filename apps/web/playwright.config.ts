// Playwright E2E smoke for the Phase 2 UI (issue #26).
//
// Runs the Vite dev server against the deployed dev backend. The dev stack
// must already be applied and apps/web/.env.local must point at it (see
// apps/web/README.md). These tests hit the real API, Cognito, S3, and
// DynamoDB — they are NOT part of `npm test` or CI.
//
//   npm run e2e            # from the repo root (workspace script)
//   npx playwright test    # from apps/web

import { defineConfig, devices } from '@playwright/test'

// E2E_BASE_URL runs the same journey against a deployed site (e.g. the dev
// CloudFront URL from `terraform -chdir=infra/envs/dev output -raw web_url`);
// without it the config keeps the local Vite dev server default.
const DEPLOYED_BASE_URL = process.env.E2E_BASE_URL?.trim() || undefined
const BASE_URL = DEPLOYED_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  // One worker: every test shares the same real backend account.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // A deployed base URL already serves the built SPA; only start Vite locally.
  ...(DEPLOYED_BASE_URL
    ? {}
    : {
        webServer: {
          // `npm run dev` is `vite`; the port is pinned so baseURL is deterministic.
          command: 'npm run dev -- --port 5173 --strictPort',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
})
