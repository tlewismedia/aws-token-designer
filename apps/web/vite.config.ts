import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import type { UserConfig } from 'vite'

// Dev proxy: /api → the dev HTTP API so the browser sees same-origin requests
// (no CORS; matches the CloudFront same-origin design, PLAN 7.4).
//
// Target comes from Vite env files (apps/web/.env.local, gitignored):
// VITE_API_URL, e.g. the execute-api URL from
//   terraform -chdir=infra/envs/dev output api_url
//
// NOTE: loadEnv is required here — Vite does NOT populate process.env from
// .env* files while evaluating the config, so `process.env.VITE_API_URL`
// would silently disable the proxy. See apps/web/README.md.
// The browser only ever calls relative /api/...; the proxy strips the prefix
// because the HTTP API stage is named `api`.

export default defineConfig(({ mode }) => {
  // Prefix '' loads every variable in .env* files (not just VITE_* ones).
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL

  const server: UserConfig['server'] = apiTarget
    ? {
        proxy: {
          '/api': {
            target: apiTarget,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
        },
      }
    : {}

  // https://vite.dev/config/
  return {
    plugins: [react()],
    server,
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      globals: false,
    },
  }
})
