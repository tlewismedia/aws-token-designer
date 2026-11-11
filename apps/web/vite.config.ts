import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import type { UserConfig } from 'vite'

// Dev proxy: /api → the dev HTTP API so the browser sees same-origin requests
// (no CORS; matches the CloudFront same-origin design, PLAN 7.4).
// Target comes from apps/web/.env.local (gitignored): VITE_API_URL, e.g. the
// execute-api URL from `terraform -chdir=infra/envs/dev output api_url`.
// See apps/web/README.md and .env.example.

const apiTarget = process.env.VITE_API_URL

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
export default defineConfig({
  plugins: [react()],
  server,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
  },
})
