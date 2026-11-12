# Security

Security posture, threat model, and the controls checklist for AWS Token
Designer. This is a public demo repository; the disclosure process lives in the
root [`SECURITY.md`](../SECURITY.md) and the publication rules in
[`docs/PUBLIC_SAFE.md`](PUBLIC_SAFE.md).

> **Scope note:** v1 is a demo. It deliberately omits MFA, password reset,
> email verification (Cognito auto-confirms), and a custom domain. Those choices
> are documented tradeoffs, not oversights — see `docs/PLAN.md` §2 and §6.3.

## Threat model (STRIDE summary)

| Threat | Mitigation |
|---|---|
| **Spoofing** | Cognito issues JWTs; API Gateway's JWT authorizer validates issuer/audience. Handlers derive `sub`/`email` from claims and never trust body-supplied identity. |
| **Tampering** | zod validates every request body/path; ownership is checked against `USER#<sub>`; uploads are re-encoded server-side with `sharp` (magic-byte check + EXIF strip). |
| **Repudiation** | Structured request logs (API Gateway access logs with `requestId`, route, status, latency); CloudWatch Logs retention 7d dev / 30d prod; CloudTrail management events (account-level). |
| **Information disclosure** | Private S3 buckets with public access blocked; presigned PUT/GET URLs with short TTLs; no secrets in the repo or Terraform state; safe error envelopes (no stack traces or internal identifiers). |
| **Denial of service** | API Gateway throttling (10 rps / burst 20); per-user daily generation cap (20/day); unreserved Lambdas behind the account concurrency limit; daily AI count/cost alarms. |
| **Elevation of privilege** | Least-privilege IAM per function (table + media bucket + specific SSM parameter ARNs); no admin routes; every path id is checked against the caller's partition. |
| **Webhook forgery** | Stripe signature verified against the raw body with the webhook secret; unsigned/invalid requests get a generic `400`. |
| **Payment replay** | `TransactWriteItems` conditioned on `status = pending` and the event id not already in `processedEventIds`; a replay is acknowledged without a second credit grant. |

## Controls checklist (`docs/PLAN.md` §8.2)

- [x] No secrets in repo; gitleaks/trufflehog clean. — `lefthook.yml` runs
  `gitleaks protect --staged` on every commit; a full-tree `gitleaks detect`
  was run for this phase (see "Verification" below).
- [x] Secrets in SSM SecureString; no secret values in Terraform state. —
  Terraform carries parameter **names** only (`infra/envs/*/main.tf`
  `ssm_parameter_names`); values are created out-of-band (`docs/TERRAFORM.md`).
- [x] All API routes authenticated except `/health` and `/webhooks/stripe`. —
  The route table in `infra/modules/api/main.tf` sets `authorization_type = JWT`
  for everything else.
- [x] JWT `sub` used for identity; path IDs checked against ownership. — Shared
  `byId` GSI lookup answers 404 (missing) vs 403 (other user's item).
- [x] Stripe session ownership verified before status return. —
  `GET /checkout/session/{id}` compares the payment's `userId` with the JWT
  `sub`.
- [x] Webhook signature verified; idempotent fulfillment. — Real Stripe SDK
  signature check in `apps/api/test/payments.test.ts`; DynamoDB transaction
  proven in `repo.integration.test.ts`.
- [x] zod validation on every handler; style allowlist; length caps. — Shared
  schemas in `packages/shared`; route tests cover invalid bodies.
- [x] Presigned upload constraints (type, size); sharp re-encode strips EXIF. —
  10 MB max, PNG/JPEG/WebP, signed content-length/type, magic-byte check,
  re-encode + 512px thumbnail.
- [x] S3 public access blocked; OAC; short URL TTLs. — Both buckets use
  public-access blocks and SSE-S3; CloudFront reads the web bucket via OAC;
  presigned URLs expire in 1 hour.
- [x] Least-privilege IAM per Lambda. — Separate roles for `api` and
  `generateWorker`, scoped to the table, media bucket, specific SSM parameter
  ARNs, and the AWS-managed SSM KMS key.
- [x] CORS not needed (same-origin); Vite proxy in dev. — The SPA calls relative
  `/api/*`; CloudFront proxies it. The only CORS rule is the media bucket's
  presigned-PUT rule (CloudFront origin + dev localhost).
- [x] CSP/security headers via CloudFront. — HSTS (1 year, includeSubdomains),
  `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP that allows
  self + Cognito + presigned S3 + Stripe frames/connect.
- [x] No stack traces/internal details in client errors. — One error handler
  returns `{ error: { code, message, requestId } }`.
- [ ] CloudTrail management events enabled. — **Account-level setting**, not
  managed by this repo. Operators should confirm a multi-region trail with
  management events in the AWS account; it is not enforced by Terraform here.
- [x] Dependency scanning (Dependabot/Renovate, `npm audit`). —
  `.github/dependabot.yml` covers npm and GitHub Actions weekly.
  `npm audit --omit=dev` reports 0 vulnerabilities; the 7 moderate advisories
  are dev-only (`minimatch` via `@typescript-eslint`).
- [ ] Branch protection, secret scanning, CodeQL if public. — **GitHub
  repository settings**, not encoded in the repo. The intended configuration is
  in `docs/PUBLIC_SAFE.md`; enable required checks/branch protection and secret
  scanning in the GitHub UI. CodeQL is optional for this demo but recommended
  if the repository is public.
- [x] Daily generation cap and kill switch. — `RATE#<date>` conditional
  increment (20/user/day) plus the fail-closed
  `/token-designer/<stage>/generation-enabled` SSM switch.

The two unchecked items are external/account settings, not code gaps. Keep
them visible until an operator confirms them.

## Secret handling

| Secret | Storage | Rotation |
|---|---|---|
| Stripe secret key | SSM SecureString `/token-designer/<stage>/stripe/secret` | Overwrite the parameter; warm Lambdas may cache until the environment recycles. |
| Stripe webhook signing secret | SSM SecureString `/token-designer/<stage>/stripe/webhook-secret` | Overwrite; restart/redeploy the function if needed. |
| Stability API key | SSM SecureString `/token-designer/<stage>/stability/api-key` | Overwrite. |
| Generation kill switch | SSM String `/token-designer/<stage>/generation-enabled` (`true`/`false`) | Overwrite. |

Rules:

- Never commit `.env*`, `*.tfvars` with secrets, Terraform state/plan files, or
  `backend.hcl`. `.gitignore` covers them; gitleaks runs pre-commit.
- Frontend env contains public values only (`VITE_AWS_REGION`,
  `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`).
- Lambda env vars reference parameter **names**, never values.
- If a secret is exposed, rotate first, then purge history (see
  `docs/PUBLIC_SAFE.md`).

**Current environment status:** no Stability or Stripe SecureStrings exist in
the dev account yet, so live generation and checkout cannot succeed until an
operator creates them (backlog #29 for Stability, #34 for Stripe). All
deployable failure paths are verified: generation 503/`GENERATION_DISABLED`
semantics and checkout `503 BILLING_DISABLED`.

## Authorization model

- **Identity source:** Cognito ID token; API Gateway validates the JWT before
  Lambda runs.
- **Partitioning:** every DynamoDB item is keyed `USER#<sub>` (profiles,
  images, sheets, jobs, rate limits). Payments are keyed
  `PAYMENT#<sessionId>` with a `userId` attribute.
- **Cross-user access:** resolve an id through the `byId` GSI, then compare its
  `PK` with `USER#<sub>`: missing → 404, other user → 403.
- **Unauthenticated paths:** `GET/HEAD /health` and
  `POST /webhooks/stripe` (signature is its authentication).

## Upload constraints

- Maximum 10 MB; `image/png`, `image/jpeg`, `image/webp`.
- Presigned PUT signs the exact content length and content type.
- `/complete` verifies magic bytes, strips EXIF, re-encodes, and writes a
  512 px thumbnail; user-supplied paths are never used.
- Media bucket is private; reads go through 1-hour presigned GETs.

## Headers and browser hardening

CloudFront attaches the same response-headers policy to the SPA and `/api/*`
behaviors: HSTS, `nosniff`, frame deny, referrer policy, and CSP. API responses
are never cached (`CachingDisabled`). Same-origin hosting removes the need for
permissive CORS on the API.

## Dependency and secret scanning

- **Dependabot** (`.github/dependabot.yml`): weekly npm + GitHub Actions
  updates, minor/patch grouped.
- **`npm audit`**: production dependencies clean (`--omit=dev`); the remaining
  moderate advisories are dev tooling (`minimatch` through
  `@typescript-eslint`), tracked by Dependabot.
- **gitleaks**: pre-commit hook; configured in `lefthook.yml`.
- **GitHub secret scanning/CodeQL**: repository settings to enable, listed in
  `docs/PUBLIC_SAFE.md`.

## Verification for this phase

```sh
# Secret scan across the working tree (gitleaks must be installed).
gitleaks detect --source . --no-git --redact -v

# Production dependency audit.
npm audit --omit=dev

# Authorization / upload-offence checks (deployed stage; see docs/TESTING.md).
curl -i "$API/me"                                  # 401 without a token
curl -i -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$API/images/$OTHER_USERS_IMAGE"                 # 403 cross-user
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"big","contentType":"image/png","size":11534336}' \
  "$API/images/upload-url"                         # 413 over 10 MB
```

## Related

- Root [`SECURITY.md`](../SECURITY.md) — vulnerability disclosure.
- [`docs/PUBLIC_SAFE.md`](PUBLIC_SAFE.md) — what may be published.
- [`docs/PLAN.md`](PLAN.md) §8 — security design and controls.
- [`docs/RUNBOOK.md`](RUNBOOK.md) — incident response.
- ADR-0004 (presigned media), ADR-0006 (auto-confirm), ADR-0007 (webhook).
