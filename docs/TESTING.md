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

Set `E2E_BASE_URL` to run the same journey against a deployed site instead of
the local Vite server; the Playwright config then uses that URL as `baseURL`
and does not start `webServer`:

```sh
WEB=$(terraform -chdir=infra/envs/dev output -raw web_url)
E2E_BASE_URL="$WEB" npm run e2e
```

The deployed run needs the same seeded user and does not read
`apps/web/.env.local` for app config (the build already baked it in); set
`E2E_USER_POOL_ID` for Cognito cleanup.

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

E2E requires a live backend and is not part of `npm test`. It runs manually,
or in CI's optional gated `e2e` job when `E2E_ROLE_ARN`, `E2E_BASE_URL`, and
the `E2E_EMAIL`/`E2E_PASSWORD` secrets are configured (see "CI vs. manual
checks" below). Vitest excludes `apps/web/e2e/**`.

The CI job reads these repository settings (Settings → Secrets and variables →
Actions): variables `E2E_ROLE_ARN`, `E2E_BASE_URL`, optional
`E2E_USER_POOL_ID` and `AWS_REGION`; secrets `E2E_EMAIL`, `E2E_PASSWORD`. It
skips when the variables are absent, and the run step exits 0 when the secrets
are absent.

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

## AI generation smoke (Phase 3)

Unit coverage (offline, no Stability key needed):

```sh
npm test --workspace @aws-token-designer/api   # worker + jobs route tests
npm test --workspace @aws-token-designer/shared # generate/job schemas
```

Live `dev` checks (replace `$API` / `$TOKEN` as above). Generation is async:
`POST` returns `202 { jobId }`, then poll `GET /jobs/{jobId}` every 2s.

Polling is bounded: the client stops after ~150 s (75 attempts at 2 s) even if
the job never reaches a terminal state, and shows “still working — check the
gallery” instead of polling forever. Server-side, a `processing` job whose
`processingAt` lease is older than 150 s can be reclaimed by a Lambda async
retry, so a crashed/timed-out worker cannot leave a job stuck forever. The
lease is deliberately longer than the 120 s worker timeout and shorter than
Lambda's ~180 s first retry.

```sh
# 1. Submit a generation.
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a goblin chief","style":"anime"}' \
  "$API/images/generate"                              # 202 { "jobId": "..." }

# 2. Poll the job until terminal.
curl -i -H "Authorization: Bearer $TOKEN" "$API/jobs/$JOB_ID"
#    pending → processing → succeeded | failed

# 3. Validation + ownership.
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{}' \
  "$API/images/generate"                              # 400 VALIDATION_ERROR
curl -i -H "Authorization: Bearer $TOKEN" \
  "$API/jobs/$OTHER_USERS_JOB_ID"                     # 403 FORBIDDEN
curl -i -H "Authorization: Bearer $TOKEN" \
  "$API/jobs/does-not-exist"                          # 404 NOT_FOUND
```

Guardrails (current environment has **no Stability key**, so the live success
path cannot be verified until an operator creates the SecureString):

- Missing key → job `failed` with `error: "GENERATION_FAILED"`; client stops
  polling and shows a safe message.
- `/token-designer/dev/generation-enabled` set to anything other than `true`
  (or missing) → job `failed` with `error: "GENERATION_DISABLED"`, and
  Stability is never called.
- The 21st generation for a user in one UTC day → `429 RATE_LIMITED`; the
  atomic `RATE#<yyyy-mm-dd>` counter never exceeds 20.
- Lambda async retries cannot duplicate images: only the first attempt can
  move the job `pending → processing`.

DynamoDB inspection:

```sh
aws dynamodb query --table-name "$TABLE" \
  --key-condition-expression 'PK = :pk AND begins_with(SK, :job)' \
  --expression-attribute-values '{":pk":{"S":"USER#<sub>"},":job":{"S":"JOB#"}}' \
  --region us-west-2
```

Alarms: `token-designer-dev-generation-count-daily` (>50/day),
`token-designer-dev-estimated-ai-cost-daily` (>$5/day), and
`token-designer-dev-generation-failures` (handled failures, Sum ≥ 1 over 5
min), all against namespace `TokenDesigner`, dimension `Stage=dev`.

## Payments smoke (Phase 4)

The purchase UI stays disabled (`/buy-credits` is still a placeholder), but the
backend is live-ready. In `dev` the current environment has **no Stripe keys in
SSM**, so checkout answers `503 BILLING_DISABLED` and the webhook answers `503`
until an operator configures them.

### Offline tests

```sh
npm test --workspace @aws-token-designer/shared   # payment zod schemas
npm test --workspace @aws-token-designer/api      # checkout/status/webhook routes
RUN_DDB_INTEGRATION=1 npm test --workspace @aws-token-designer/api
```

The webhook unit tests use the real Stripe SDK to sign fixtures with
`Stripe.webhooks.generateTestHeaderString` and verify the raw body with
`constructEvent`. The DynamoDB Local integration suite proves the transaction
grants credits exactly once, rejects a replayed event id, transitions
`pending → succeeded`, and enforces payment ownership.

### Configure Stripe test mode (out-of-band)

```sh
# Secret key (test mode) and webhook signing secret. Values never enter
# Terraform state or the repo.
aws ssm put-parameter --name "/token-designer/dev/stripe/secret" \
  --type SecureString --value "sk_test_..." --region us-west-2 --overwrite
aws ssm put-parameter --name "/token-designer/dev/stripe/webhook-secret" \
  --type SecureString --value "whsec_..." --region us-west-2 --overwrite
```

Set the non-secret price id at apply time (or in a gitignored tfvars file):

```sh
terraform -chdir=infra/envs/dev apply -var="stripe_price_id=price_..."
```

The API Lambda reads the two parameter names from its environment and decrypts
the SecureStrings at request time; redeploy is not needed after rotating a
secret (a warm invocation may cache the old value until the environment is
recycled).

### Webhook URL and Stripe CLI

The webhook is on the execute-api URL (ADR-0007), not CloudFront:

```
https://<api-id>.execute-api.<region>.amazonaws.com/api/webhooks/stripe
# = $(terraform -chdir=infra/envs/dev output -raw api_url)/webhooks/stripe
```

Forward Stripe test events while developing:

```sh
API=$(terraform -chdir=infra/envs/dev output -raw api_url)
stripe listen --forward-to "$API/webhooks/stripe"
# then, in another shell, complete a test checkout.
```

Do not create the endpoint in the Stripe dashboard for local verification; the
CLI supplies its own `whsec_...` test secret (copy it into the SSM parameter
above).

### Manual API checks

```sh
# Unconfigured deployment: checkout is disabled without breaking other routes.
curl -i -X POST -H "Authorization: Bearer $TOKEN" "$API/checkout/session"
#   503 { "error": { "code": "BILLING_DISABLED", ... } }

# Configured: create an embedded session + pending PAYMENT.
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{}' "$API/checkout/session"
#   201 { "sessionId": "cs_test_...", "clientSecret": "cs_test_..._secret_..." }

# Status: owner 200 { status, creditsGranted } only; other user 403; missing 404.
curl -i -H "Authorization: Bearer $TOKEN" "$API/checkout/session/$SESSION_ID"
curl -i -H "Authorization: Bearer $TOKEN" "$API/checkout/session/$OTHER_USERS_SESSION_ID"

# Webhook signature failures are a generic 400 (no reason leaked).
curl -i -X POST -H 'Stripe-Signature: t=1,v1=bad' \
  -H 'Content-Type: application/json' -d '{}' "$API/webhooks/stripe"
```

Replay the same Stripe event (CLI or dashboard "Resend") and confirm
`credits` in DynamoDB is unchanged. A transient DynamoDB error returns 5xx so
Stripe retries; the replay path returns 200 without a second grant.

If the Stripe API call succeeds but the `PAYMENT` write fails, the API returns
500 and logs the session id (`checkout session orphaned: payment write failed`)
so an operator can reconcile or refund the orphaned session. No credit is
recorded and no webhook fulfillment can match it.

Inspect a payment:

```sh
aws dynamodb get-item --table-name "$TABLE" \
  --key '{"PK":{"S":"PAYMENT#cs_test_..."},"SK":{"S":"PAYMENT"}}' \
  --region us-west-2
```

### Return page states

`GET /checkout/session/{id}` returns only `{ status, creditsGranted }`:

- `succeeded` → “Payment confirmed — N credits added.”
- `pending` → “Credits are being applied…”; the page polls a few times, then
  offers a Refresh button.
- `failed` → fulfillment-failed message with the `orders@example.com` contact.
- `403`/`404`/missing `session_id` → unknown order (no payment data).
- Unexpected network/API error → retryable error message.

## CloudFront hosting (Phase 5)

One CloudFront default URL serves the SPA and the same-origin `/api/*` proxy
(PLAN 7.4, ADR-0003). No custom domain in v1.

### Deploy the SPA

`scripts/deploy-web.sh` reads the `infra/envs/dev` outputs, builds
`@aws-token-designer/web` with `VITE_AWS_REGION` / `VITE_COGNITO_*` (no API
URL — the SPA calls relative `/api/...`), syncs `apps/web/dist` to the web
bucket, and invalidates only `/index.html`:

```sh
./scripts/deploy-web.sh
# deploy-web: building SPA for https://dxxxx.cloudfront.net
# deploy-web: deployed https://dxxxx.cloudfront.net
```

It fails fast when AWS credentials or the Terraform outputs are missing. Cache
policy: content-hashed assets are `public,max-age=31536000,immutable`;
`index.html` is `no-cache`. `aws s3 sync --delete` removes stale bundles from
previous deploys.

### Verify the default URL

```sh
WEB=$(terraform -chdir=infra/envs/dev output -raw web_url)
DIST=$(terraform -chdir=infra/envs/dev output -raw cloudfront_distribution_id)

# 200 + HSTS / nosniff / frame deny / referrer policy / CSP
curl -sI "$WEB/" | head -20

# Same-origin API: 200 and no CORS headers (the browser never crosses origins)
curl -sI "$WEB/api/health"

# SPA fallback: extensionless deep links return index.html 200, with the query
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/return?session_id=cs_test_x"
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/login"

# API semantics are NOT rewritten: unauthenticated /me is still 401 JSON
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/api/me"

# Invalidation check (only /index.html should be invalidated per deploy)
aws cloudfront get-invalidation --distribution-id "$DIST" --id <invalidation-id>
```

SPA deep links use a CloudFront Function on the default behavior, not
`custom_error_response`; that deliberate deviation keeps API 401/403/404
statuses intact. See "Phase 5 additions" in docs/TERRAFORM.md.

## Alarm and budget drill (Phase 6)

All alarms route to the SNS alerts topic and therefore to `alert_email`.

**Dimension-accurate triggers.** `set-alarm-state` proves SNS routing but not
that an alarm matches the real metric dimensions (a wrong dimension leaves the
alarm in `INSUFFICIENT_DATA`). Publish real datapoints first, wait for the
alarm, then reset. Replace the ids with the dev/prod outputs:

```sh
STAGE=dev REGION=us-west-2
API_ID=$(terraform -chdir="infra/envs/$STAGE" output -raw api_id)
API_FN=$(terraform -chdir="infra/envs/$STAGE" output -raw api_lambda_name)
WORKER_FN=$(terraform -chdir="infra/envs/$STAGE" output -raw generation_worker_name)
TABLE=$(terraform -chdir="infra/envs/$STAGE" output -raw table_name)

aws cloudwatch put-metric-data --region "$REGION" --namespace AWS/ApiGateway \
  --metric-data "[{\"MetricName\":\"5xx\",\"Dimensions\":[{\"Name\":\"ApiId\",\"Value\":\"$API_ID\"},{\"Name\":\"Stage\",\"Value\":\"api\"}],\"Value\":1}]"
aws cloudwatch put-metric-data --region "$REGION" --namespace AWS/Lambda \
  --metric-data "[{\"MetricName\":\"Errors\",\"Dimensions\":[{\"Name\":\"FunctionName\",\"Value\":\"$API_FN\"}],\"Value\":1}]"
aws cloudwatch put-metric-data --region "$REGION" --namespace AWS/Lambda \
  --metric-data "[{\"MetricName\":\"Errors\",\"Dimensions\":[{\"Name\":\"FunctionName\",\"Value\":\"$WORKER_FN\"}],\"Value\":1}]"
aws cloudwatch put-metric-data --region "$REGION" --namespace AWS/DynamoDB \
  --metric-data "[{\"MetricName\":\"ReadThrottleEvents\",\"Dimensions\":[{\"Name\":\"TableName\",\"Value\":\"$TABLE\"}],\"Value\":1}]"
aws cloudwatch put-metric-data --region "$REGION" --namespace TokenDesigner \
  --metric-data "[{\"MetricName\":\"GenerationFailures\",\"Dimensions\":[{\"Name\":\"Stage\",\"Value\":\"$STAGE\"}],\"Value\":1}]"

# Wait for the 5-minute period to evaluate, then confirm ALARM and reset.
aws cloudwatch describe-alarms --region "$REGION" \
  --alarm-name-prefix "token-designer-$STAGE-" \
  --query 'MetricAlarms[].[AlarmName,StateValue]' --output table
```

If the state does not move, the dimensions are wrong (fix the alarm) — this is
the check that catches dimension bugs.
Trigger each one directly instead of waiting for a metric breach (CloudWatch
sends the action on the `ALARM` transition):

```sh
STAGE=dev REGION=us-west-2
for name in \
  api-5xx api-lambda-errors worker-lambda-errors \
  api-lambda-throttles worker-lambda-throttles \
  dynamodb-read-throttle-events dynamodb-write-throttle-events \
  generation-failures generation-count-daily estimated-ai-cost-daily; do
    alarm="token-designer-${STAGE}-${name}"
    aws cloudwatch set-alarm-state --alarm-name "$alarm" \
      --state-value ALARM --state-reason "test trigger" --region "${REGION}"
    sleep 2
    aws cloudwatch set-alarm-state --alarm-name "$alarm" \
      --state-value OK --state-reason "drill complete" --region "${REGION}"
  done

# Confirm the expected state transitions/actions were recorded.
aws cloudwatch describe-alarm-history --alarm-name \
  "token-designer-${STAGE}-api-5xx" --history-item-type StateUpdate \
  --region "${REGION}" --max-items 5
```

The budget cannot be forced with `set-alarm-state`; verify delivery by
temporarily lowering the amount/threshold with `aws budgets update-budget`,
waiting for the next evaluation, and restoring it. The SNS topic policy grants
Budgets publish permission, so the notification reaches the same subscription.
Note that the `api-5xx` alarm's `Stage` dimension is the HTTP API stage name,
which is literally `api` (not the Terraform environment name). Record the drill
date and the email received for each alarm in the incident log
([`docs/RUNBOOK.md`](RUNBOOK.md)).

## Production smoke sequence

Prod is deployed with the same modules as dev (`infra/envs/prod`, state key
`prod/terraform.tfstate`). After the first prod apply and SPA deploy:

```sh
# 0. Public endpoints
WEB=$(terraform -chdir=infra/envs/prod output -raw web_url)
API=$(terraform -chdir=infra/envs/prod output -raw api_url)
curl -sI "$WEB/"                         # 200 + security headers
curl -s "$WEB/api/health"                # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/api/me"   # 401
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/login"    # 200 (SPA fallback)
curl -s -o /dev/null -w "%{http_code}\n" "$WEB/return?session_id=cs_test_x"  # 200

# 1. Browser journey against the deployed prod SPA. First seed the account the
#    login test uses (the registration test creates its own throwaway user).
TF_ENV=prod \
  SEED_EMAIL="<seeded-e2e-email>" \
  SEED_PASSWORD="<seeded-e2e-password>" \
  npm run seed --workspace @aws-token-designer/api

E2E_BASE_URL="$WEB" \
E2E_EMAIL="<seeded-e2e-email>" \
E2E_PASSWORD="<seeded-e2e-password>" \
E2E_USER_POOL_ID="$(terraform -chdir=infra/envs/prod output -raw user_pool_id)" \
  npm run e2e
```

The login journey needs a **pre-seeded** account; do not use an ad-hoc
`e2e+<timestamp>@example.com` address for `E2E_EMAIL` (that address belongs to
the registration test, which creates and optionally deletes its own user).

What is verified without operator secrets:

- register/login/logout, profile + credits, SPA deep links, security headers;
- image upload (presigned PUT), thumbnail, gallery, add/remove/clear/delete;
- print (Playwright stubs `window.print`);
- generation route returns `202` and the job reaches `failed` with
  `GENERATION_DISABLED`/`GENERATION_FAILED` (no Stability key yet);
- checkout returns `503 BILLING_DISABLED` (no Stripe secret yet) and the
  return page renders its unknown/disabled state.

What **needs operator keys** (backlog #29 Stability, #34 Stripe): a successful
generation image and a real Stripe test checkout/webhook. Document the date and
the exact checks run when prod is smoke-tested; do not claim those two paths
green until the SSM SecureStrings exist.

```sh
# Post-smoke cleanup for the registration test's synthetic user (if the AWS CLI
# is available), per the browser E2E cleanup notes above. Registration users
# use the e2e+<timestamp>@example.com form.
aws cognito-idp admin-delete-user --user-pool-id "$(terraform -chdir=infra/envs/prod output -raw user_pool_id)" \
  --username "e2e+<timestamp>@example.com" --region us-west-2
```

## Rollback drill

Rolling back the web build is the least invasive response; Lambda rollback
rebuilds the previous commit against the same Terraform state. The full
procedure and caveats are in [`docs/RUNBOOK.md`](RUNBOOK.md) ("Rollback").
The drill itself:

```sh
# 1. Record the current deploy commit; deploy the one before it to dev.
CURRENT=$(git rev-parse --short HEAD)
PREV=$(git rev-parse --short HEAD~1)
git checkout "$PREV" && ./scripts/deploy-web.sh dev

WEB=$(terraform -chdir=infra/envs/dev output -raw web_url)
curl -sI "$WEB/" | head -3
curl -sI "$WEB/api/health" | head -3

# 2. Restore the current build and redeploy.
git checkout "$CURRENT" && ./scripts/deploy-web.sh dev
```

Both deploys should print the same `web_url` with a 200 SPA and a 200
`/api/health`; the hashed asset filenames change between builds and
`/index.html` is invalidated each time. Rerun the browser E2E after the second
deploy.

## CI vs. manual checks

| Check | CI | Manual |
|---|---|---|
| lint, typecheck, build | yes (Node job) | — |
| unit/component tests | yes (Node job) | — |
| DynamoDB Local integration suite | yes (service container) | `RUN_DDB_INTEGRATION=1 npm test --workspace @aws-token-designer/api` |
| `terraform fmt -check` + `validate` | yes (all modules + both envs) | — |
| `terraform plan` (dev) | optional OIDC job; requires `AWS_PLAN_ROLE_ARN` **and** `TF_STATE_BUCKET`; runs `-lock=false` | locally with `backend.hcl` |
| diagram staleness | yes | — |
| Playwright E2E | optional OIDC job; gated on `E2E_ROLE_ARN`/`E2E_BASE_URL` and `E2E_EMAIL`/`E2E_PASSWORD` secrets | `E2E_BASE_URL=... npm run e2e` |
| alarm/budget drill | **no** | runbook commands above |
| prod smoke | **no** | commands above |

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

Phase 3 (`generateWorker`, generation routes, cap, kill switch, AI alarms) is
implemented and unit-tested in this branch. Live dev verification of the
success path is pending a Stability SecureString; the missing-key,
kill-switch, cap-429, and job-auth paths are covered by the smoke checklist
above.

Phase 4 (checkout session, status, webhook fulfillment, return-page states) is
implemented and unit/integration tested. Live dev checkout/webhook verification
is pending Stripe test-mode SecureStrings; without them the deployable paths
are checkout `503 BILLING_DISABLED`, webhook `503`/`400`, and status
`403`/`404`. The purchase UI remains disabled.

Phase 5 (CloudFront hosting) is deployed to dev and verified (SPA, same-origin
`/api/*`, deep links, security headers, `/index.html`-only invalidation).

Phase 6 (this branch): unit/component/integration suites are green locally and
in CI; the prod environment plans cleanly (72 creates — see the PR notes) and
is **not applied**; the new alarm matrix is defined but the drill is run by the
operator after apply. Prod smoke is limited to the no-key paths listed above
(backlog #29/#34). Update this section after the prod apply and the alarm/budget
drill, with dates and results.
