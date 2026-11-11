# Testing

How to verify AWS Token Designer locally and in CI, plus the manual smoke
checklist and the current deployed-dev status.

## Automated checks

Run from the repo root after `npm ci`:

```sh
npm test        # unit + component + route tests (integration skipped)
npm run lint
npm run typecheck
npm run build
```

The DynamoDB repository integration suite is skipped unless
`RUN_DDB_INTEGRATION=1`. Start DynamoDB Local, then run the API workspace:

```sh
docker run --rm -p 8000:8000 amazon/dynamodb-local
RUN_DDB_INTEGRATION=1 npm test --workspace @aws-token-designer/api
```

The suite defaults to `http://localhost:8000` (override with `DDB_LOCAL_URL`)
and creates/deletes its own `token-designer-test` table, including the `byId`
GSI. CI runs the same command in the `node` job with a DynamoDB Local service
container (`.github/workflows/ci.yml`).

Terraform:

```sh
terraform fmt -check -recursive
# per directory with .tf files:
terraform -chdir=infra/modules/<module> init -backend=false
terraform -chdir=infra/modules/<module> validate
```

## Browser E2E (Playwright)

The Phase 2 UI smoke drives the real `dev` backend (Cognito, HTTP API, S3) in
headless Chromium. It lives in `apps/web/e2e/phase2.spec.ts` with
`apps/web/playwright.config.ts`.

```sh
npx playwright install chromium   # once per machine
npm run e2e                       # from the repo root
```

Prerequisites:

- `apps/web/.env.local` points at the deployed dev stack (see
  `apps/web/README.md`); the Playwright `webServer` runs the Vite dev server on
  `http://localhost:5173` and reuses an already-running one.
- The seeded dev user exists (`dev-user@example.com` / `Test1234!` from
  `npm run seed --workspace @aws-token-designer/api`). Override with
  `E2E_EMAIL` / `E2E_PASSWORD`.
- AWS credentials in the shell if the registration test should delete its
  Cognito user. Without them (or without `E2E_USER_POOL_ID` /
  `VITE_COGNITO_USER_POOL_ID` in `.env.local`) the test still passes but logs a
  warning and leaves the user behind.

What it covers: the logged-out marketing page and protected-route redirect,
login plus navbar credits from `GET /me`, PNG upload and gallery thumbnail,
add/remove/clear tokens, print (with `window.print` stubbed via
`addInitScript`, after the thumbnail gate opens), image delete, logout back to
the marketing page, and registration with a unique per-run
`e2e+<timestamp>@example.com` address (the pre-sign-up trigger auto-confirms).

Isolation and cleanup:

- The spec clears the seeded user's sheet and deletes any `e2e-` gallery image
  left by an earlier failed run before starting, so re-runs do not need a
  pristine account. It deletes the image it created.
- Registration users are removed in `afterAll` with the `aws` CLI binary
  (`aws cognito-idp admin-delete-user`, invoked directly, not through a shell);
  without the CLI the user is left behind with a warning.
- Their lazily created DynamoDB `PROFILE` / `SHEET` items remain: there is no
  account-deletion API yet. This is accepted for the dev stage; delete the
  items manually if they get noisy.

E2E requires a live dev backend and is intentionally **not** part of
`npm test` or CI. Vitest excludes `apps/web/e2e/**`.

## Manual smoke checklist

Against a deployed dev stage (or the Vite dev app pointed at it):

1. **Register/login** — new account logs in; navbar shows 10 credits.
2. **Upload** — drag/drop a PNG/JPEG/WebP under 10 MB; thumbnail appears in
   the gallery.
3. **Add** — add an image to the sheet; count rises.
4. **Remove** — remove a single token by clicking its ×; the clicked token
   disappears, not the tile before it.
5. **Clear** — Clear empties the sheet.
6. **Delete** — delete an image; it leaves the gallery and any sheet that
   referenced it.
7. **Print** — Print opens the browser dialog with the sheet laid out at
   7×9 and waits for thumbnails to load.

API checks (replace `$API` with the dev `api_url` output and `$TOKEN` with a
Cognito ID token; `$OTHER_USERS_IMAGE` with an image id owned by another user):

```sh
curl -i "$API/health"                                  # 200
curl -i "$API/me"                                      # 401 without a token
curl -i -H "Authorization: Bearer $TOKEN" "$API/me"    # 200
curl -i -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$API/images/$OTHER_USERS_IMAGE"                     # 403 cross-user
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"big","contentType":"image/png","size":11534336}' \
  "$API/images/upload-url"                             # 413 over 10 MB
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"bad","contentType":"application/pdf","size":10}' \
  "$API/images/upload-url"                             # 400 unsupported type
```

`PATCH /sheets/{id}` with `images` validates every id: foreign → 403, unknown
→ 404, non-ready → 400, `[]` → 200, more than 63 entries → 400.

## Deployed dev status

Last verified: **2026-11-11** (dev stage, after the Phase 2 deploy).

- API smoke: **green**
  - health 200, `me` 200 (profile + default sheet bootstrap)
  - upload → complete → thumbnail URL works; add/remove/clear work
  - 63-token cap returns 409 on overflow
  - 11 MB upload returns 413; non-image returns 400
  - cross-user image id returns 403
  - delete removes S3 objects and sheet references
- Browser E2E / print smoke: **green** (2026-11-11) — `npm run e2e`
  (Playwright, headless Chromium, 2 tests passed) against the dev stack:
  logged-out marketing page + `/dashboard` redirect, seeded-user login with
  navbar credits, PNG upload/thumbnail, add/remove/clear tokens, print
  (`window.print` stub), image delete, logout, and auto-confirmed
  registration. See "Browser E2E (Playwright)" above.

Update this section when the browser/print pass is recorded.
