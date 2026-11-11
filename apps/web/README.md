# @aws-token-designer/web

Vite + React 19 + TypeScript SPA. Auth via Amazon Cognito (Amplify Auth v6),
server state via TanStack Query v5, API via the same-origin `/api` proxy.

## Local development

1. The dev stack must be applied once (`infra/envs/dev`), then grab the
   public config:

   ```sh
   terraform -chdir=infra/envs/dev output -json user_pool_id client_id api_url
   ```

2. Copy `.env.example` to `.env.local` (gitignored) and fill in:

   ```
   VITE_AWS_REGION=us-west-2
   VITE_COGNITO_USER_POOL_ID=<user_pool_id>
   VITE_COGNITO_CLIENT_ID=<client_id>
   VITE_API_URL=<api_url>
   ```

   All of these are public values; `VITE_API_URL` is a build/dev process
   variable (the browser only ever calls relative `/api/...`), so it is kept
   in `.env.local` rather than `.env.example`-committed values.

3. Optional: seed a test user/profile/sheet:

   ```sh
   npm run seed --workspace @aws-token-designer/api
   ```

4. Run it:

   ```sh
   npm run dev --workspace apps/web
   ```

The Vite dev server proxies `/api/*` to `VITE_API_URL` (prefix stripped, since
the HTTP API stage is named `api`). Without `VITE_API_URL` the proxy is
disabled — the app still boots (auth requires the Cognito env values).

## Routes

- `/` — marketing page (logged out) / SheetBuilder (logged in)
- `/login`, `/register`
- `/dashboard`, `/buy-credits`, `/return` — protected (redirect to `/login`)

## Scripts

- `npm run dev` — dev server with proxy
- `npm run build` — `tsc -b && vite build`
- `npm run test` — vitest
- `npm run lint` / `npm run typecheck`
