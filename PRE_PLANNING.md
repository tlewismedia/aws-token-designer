# Pre-Planning — AWS Token Designer

**Status:** Pre-planning / decisions mostly settled
**Started:** 2026-11-09
**Source app:** `/Users/tomlewis/prj/firebase-token-designer`
**Target app:** `/Users/tomlewis/prj/aws-token-designer`

This document captures the discussion and decisions *before* the official implementation plan is written. It is intentionally a working document.

---

## 1. Source App Summary

A React 19 SPA (Create React App) with Firebase:

- **Auth:** Firebase Auth email/password.
- **Data:** Firestore.
  - `users/{uid}` — profile (`email`, `credits`, `createdAt`).
  - `users/{uid}/images/{imageId}` — image metadata (`name`, `description`, `style`, `thumb`, `full`, `createdAt`).
  - `users/{uid}/collections/{sheetId}` — token sheets (`name`, `template`, `images[]` up to 63).
  - `payments/{sessionId}` — Stripe payment/fulfillment state.
- **Storage:** Firebase Storage.
  - `generated/{uid}/{imageId}/{imageId}_full.png`
  - `generated/{uid}/{imageId}/{imageId}_thumb.png`
- **Functions (callable unless noted):**
  - `auth.bootstrapUserProfile` — auth `onCreate` trigger; creates profile (10 credits) + default sheet.
  - `images.generate` — calls Stability AI `stable-image/generate/ultra`, uploads full + thumbnail (sharp).
  - `images.upload` — accepts base64 image, uploads full + thumbnail.
  - `stripe.createCheckoutSession` — embedded Stripe Checkout.
  - `stripe.getSessionStatus` — return page status.
  - `stripe.webhook` — HTTP function; grants credits on `checkout.session.completed`.
- **Frontend behavior:**
  - Home shows marketing page when logged out, `SheetBuilder` when logged in.
  - Gallery of generated/uploaded images; add to latest sheet; remove; delete.
  - Token sheet renders up to 63 images; print via `window.print()`.
  - Credit balance displayed; **credit deduction is currently commented out** and purchase UI is disabled.
  - Real-time Firestore subscriptions feed Zustand stores.
- **Size:** ~1.5k lines of components; 4 backend modules.

---

## 2. Confirmed Decisions

| # | Decision | Notes |
|---|---|---|
| 1 | **Exact port for now** | Improve later. Avoid behavior changes unless required for AWS/security. |
| 2 | **No existing real users** | No data/auth migration required. Start clean. |
| 3 | **AI costs are acceptable** | Keep Stability AI for now (subject to abuse guardrails). |
| 4 | **Keep Stripe as-is for now** | Embedded checkout, same flow; may change later. |
| 5 | **No fully local dev required** | Hybrid local/dev-AWS is acceptable. This is a demo, not a real product yet. |
| 6 | **Cost strategy + monitoring required** | Document costs and set up budget/monitoring alerts. Low traffic expected. |
| 7 | **Use AWS default URLs for now** | Domain is at another registrar; skip Route 53/ACM/custom domain initially. |
| 8 | **Fix security issues during the port** | No secrets in repo/logs; fix auth/ownership flaws. |
| 9 | **Custom auth forms** | React forms + Amplify Auth v6, not Cognito Hosted UI. |
| 10 | **Simplest login UX for now** | No email verification, no password reset, no MFA, no social login. Improve later. |
| 11 | **Terraform for IaC** | Not CDK/SST. See Terraform notes and primer below. |
| 12 | **API Gateway HTTP API** | HTTP API is a type of API Gateway (not a separate service). See 4.2. |
| 13 | **Presigned S3 for media** | CloudFront signed URLs are a later upgrade. |
| 14 | **DynamoDB on-demand** | Cost is negligible at demo scale. |
| 15 | **Region: us-west-2 (Oregon)** | Same/lower cost than us-west-1; no cost penalty vs us-east-1. |
| 16 | **Terraform: S3 native state lock** | S3 backend, `use_lockfile = true`, separate state per env. |
| 17 | **Terraform layout: modules + env dirs** | `infra/modules/*`, `infra/envs/{dev,prod}`. |
| 18 | **Lambda packaging: zip + sharp layer** | Docker-built arm64 layer for sharp. |
| 19 | **Manual `terraform apply` first** | GitHub Actions OIDC later. |
| 20 | **Same-origin CloudFront `/api/*` proxy** | CloudFront serves the SPA and proxies `/api/*` to HTTP API; no CORS needed. See 4.3. |
| 21 | **Budget alerts to a private address** | Placeholder `alerts@example.com` in public docs; real address kept in private config. Thresholds $1 / $5 / $10 / $25. |
| 22 | **Keep generation free + daily cap** | Matches current behavior; cap prevents AI abuse. |
| 23 | **Print thumbnails for now** | Exact port; full-res print is a later improvement. |
| 24 | **npm workspaces repo layout** | `apps/web`, `services/*`, `packages/shared`, `infra`. |
| 25 | **Node 22 pinned via `.nvmrc`** | Matches the Lambda runtime. |
| 26 | **Keep `orders@example.com` on Return page** | Exact port; revisit later. |
| 27 | **Stripe webhook: execute-api URL (Option A)** | Direct to API Gateway; no CloudFront in the webhook path. |

---

## 3. Open Decisions

| # | Topic | Options | Proposed | Status |
|---|---|---|---|---|
| 1 | Budget thresholds | $1/$5/$10/$25 | Adopt as proposed | Resolved (adopted) |
| 2 | Stripe webhook URL | execute-api vs CloudFront `/api/*` vs dedicated Function URL | execute-api (Option A) | Resolved |
| 3 | Support email on Return page | Keep `orders@example.com` vs real address | Keep for exact port | Minor |
| 4 | Terraform module granularity | Thin modules vs single root | Thin modules + env dirs | Resolved (adopted) |
| 5 | Node version | Lambda Node 22; local Node 22/24 | Pin Node 22 via `.nvmrc` | Minor |

---

## 4. Topic Notes

### 4.1 Auth: Custom Forms (Confirmed)

**Decision:** custom React forms + Amplify Auth v6 (`aws-amplify/auth`).

- Matches current `Login.tsx` / `Register.tsx`; no redirect; no Cognito hosted domain.
- `fetchAuthSession()` provides ID/access tokens; Amplify handles refresh.
- Keep the current simple UX: email + password only.

**Simplest login UX (confirmed):**
- No email verification screen.
- No password reset flow.
- No MFA, no social login.
- Auto-confirm and auto-verify email in a **pre-sign-up Lambda trigger** so registration behaves like Firebase (immediate sign-in).
- Tradeoff: anyone can register with any email. Acceptable for a demo; document the production switch to verification + SES.
- **Profile bootstrap:** lazy creation on the first authenticated API call (`GET /api/me`) instead of a post-confirmation trigger. Idempotent `PutItem` with `attribute_not_exists` creates profile (10 credits) + default sheet. Avoids trigger-ordering issues.

**Cognito config sketch:**
- Sign-in with email (`usernameAttributes: ['email']`), immutable `sub` as user ID.
- Password policy: min 8 (Cognito default; current Firebase default is 6 — minor change).
- MFA off; advanced security off (Plus tier costs more).
- User pool client: `USER_PASSWORD_AUTH` + `SRP` (Amplify default), no client secret for SPA.
- Pre-sign-up Lambda: `autoConfirmUser = true`, `autoVerifyEmail = true`.
- No hosted UI domain needed.

### 4.2 API Layer: HTTP API (Confirmed)

**Clarification:** "HTTP API" is not a separate service from API Gateway. API Gateway has three API types:
- **REST API** (v1) — older, more features, more expensive ($3.50/M).
- **HTTP API** (v2) — newer, simpler, cheaper ($1/M), lower latency.
- **WebSocket API** — persistent connections.

So choosing "HTTP API" means choosing API Gateway, specifically its lightweight HTTP API type. The alternative we discussed was **Lambda Function URLs**, which bypass API Gateway entirely.

**Decision matrix:**

| Criterion | API Gateway HTTP API + Lambda | Lambda Function URLs |
|---|---|---|
| Cognito auth | Built-in JWT authorizer, per-route | **None built-in**; verify JWT in each Lambda (`aws-jwt-verify`) |
| CORS | Declarative (not needed with same-origin proxy) | Manual per function |
| Routing | Native routes | One URL per function, or one router Lambda |
| Throttling | Stage/route throttling | Reserved concurrency only |
| Custom domain | Native later + ACM | CloudFront in front (extra layer) |
| Access logs | Built-in | CloudWatch only |
| Timeout | 30s integration | Lambda timeout (up to 15 min) |
| Payload | 10 MB | 6 MB sync |
| Cost | 1M req/mo free (12 months), then $1/M | No extra charge |
| Security code we own | Minimal | JWT verification, CORS, routing, auth errors |
| Maintenance | Less custom plumbing | More custom plumbing |

**Why HTTP API is less code to maintain:** the Cognito JWT authorizer, CORS, routing, throttling, access logs, and (later) custom domains are configuration, not code. With Function URLs we'd write and maintain JWT verification, CORS headers, error handling, and routing ourselves in every function.

The 30s/10MB limits are not blockers:
- Generation is an **async job** (`POST /api/images/generate` returns `jobId`; worker Lambda does the Stability call).
- Uploads use **presigned S3 PUT**, not base64 through the API.

**Lambda layout:**
- `api` — profile, images CRUD, sheets, checkout, job status; also processes uploads synchronously (sharp layer).
- `generateWorker` — async Stability call.
- Stripe webhook as a route on `api` with no authorizer (or a dedicated function).

### 4.3 Same-Origin CloudFront Design (Confirmed)

To use AWS default URLs and avoid CORS/domain complexity, use **one CloudFront distribution** for both the SPA and the API:

```
Browser
  |
  v
CloudFront (default URL: https://dxxxx.cloudfront.net)
  |-- default behavior "/*"        -> S3 web bucket (SPA)
  |-- behavior "/api/*"            -> API Gateway HTTP API origin
                                      (stage name "api", CachingDisabled,
                                       AllViewer origin request policy)
```

- The SPA calls **relative** `/api/...` URLs. No API base URL in the build, no CORS, no custom domain.
- API Gateway stage is named `api`; routes are `/images`, `/sheets`, etc. The execute-api URL is `https://<api-id>.execute-api.us-west-2.amazonaws.com/api/...`, which matches the CloudFront behavior path.
- CloudFront forwards the `Authorization` header to API Gateway via the `AllViewer` origin request policy.
- `/api/*` uses the managed `CachingDisabled` cache policy.
- Local dev uses a Vite proxy: `/api` → execute-api or CloudFront URL, so the browser still sees a same-origin request.
- Stripe webhooks can call the execute-api URL directly (server-to-server, no CORS/CDN needed). This avoids any CloudFront body/signature concerns.

**Benefits:** no CORS config, no ACM, no Route 53, no custom domain, no circular dependency between SPA build and API URL. A custom domain can be added later without changing the frontend (still relative `/api`).

**Terraform dependency graph:** CloudFront depends on the API and the SPA bucket; the API does not depend on CloudFront. No cycle. The SPA build only needs relative paths, so it can be built before deploy.

### 4.4 Infrastructure: Terraform (Confirmed)

**Terraform version:** >= 1.10 (native S3 state locking), AWS provider >= 5.x (or 6.x if stable).

**State backend:**
- S3 bucket (versioned, encrypted, public access blocked) in us-west-2.
- Native S3 lockfile (`use_lockfile = true`) if Terraform >= 1.10.
- Separate state per environment (`envs/dev`, `envs/prod`), not workspaces.
- Bootstrap directory creates the state bucket/lock resources (chicken-and-egg).

**Layout:**
```
infra/
  bootstrap/                # state bucket + lock
  modules/
    cognito/
    dynamodb/
    storage/
    lambda/
    api/
    cloudfront/
    monitoring/
  envs/
    dev/
      backend.tf
      main.tf
      terraform.tfvars
    prod/
      ...
```

**Provider config:**
- `region = "us-west-2"`.
- `default_tags { Project = "token-designer", Stage = var.stage, ManagedBy = "terraform" }`.
- No `us-east-1` provider alias needed initially (no CloudFront ACM cert while using the default domain). Add it later for a custom domain.

**Core resources:**
- **Cognito:** user pool, client, pre-sign-up Lambda trigger, `aws_lambda_permission`.
- **DynamoDB:** single table, on-demand, TTL for jobs.
- **S3:** web bucket + media bucket; public access block; ownership controls; SSE; CORS for presigned PUT; lifecycle rules; bucket policy for CloudFront OAC.
- **API Gateway HTTP API:** API, stage `api`, JWT authorizer, routes, integrations, throttling, access logs.
- **Lambda:** functions, IAM roles/policies, log groups with retention, reserved concurrency, environment variables (SSM parameter names, not secret values).
- **CloudFront:** distribution, OAC, origins (web bucket + API), cache policies, response headers policy, custom error responses for SPA routing.
- **SSM:** non-secret config parameters; secrets created out-of-band (see below).
- **Monitoring:** SNS topic + email subscription (`alerts@example.com`), CloudWatch alarms, AWS Budgets, Cost Anomaly Detection.
- **CloudTrail:** one management-events trail (free).

**Secrets:**
- Do **not** manage secret values in Terraform state. Create SSM SecureString parameters out-of-band with `aws ssm put-parameter --type SecureString` (or CI), and reference them by name in Lambda env vars. Terraform manages the parameter *names/ARNs*, not the values.
- Paths: `/token-designer/<stage>/stripe/secret`, `/token-designer/<stage>/stripe/webhook-secret`, `/token-designer/<stage>/stability/api-key`, `/token-designer/<stage>/generation-enabled`.

**Lambda packaging (Terraform):**
- Build TypeScript with esbuild into `dist/` (script or Makefile), then `archive_file` zips `dist/` + production `node_modules`.
- `sharp` needs a Linux build: use a Docker-built Lambda layer (`public.ecr.aws/sam/build-nodejs22.x` or `node:22` image) and attach it to the image-related functions.
- Use **arm64** (Graviton) for ~20% lower Lambda GB-second cost; sharp has arm64 binaries.
- `source_code_hash = filebase64sha256(...)` to trigger updates.
- Avoid running `npm install` inside Terraform; build in a script/CI for reproducibility.
- Alternative: container-image Lambdas with ECR. More moving parts and ECR storage cost; not needed.

**CI/CD:**
- Manual `terraform plan` / `apply` first.
- Later: GitHub Actions with OIDC role (no long-lived AWS keys), `fmt -check`, `validate`, `plan` on PR, `apply` on main.
- Never store AWS credentials in the repo.

**Terraform gotchas:**
- `prevent_destroy = true` on stateful resources in prod (DynamoDB, S3, Cognito).
- S3 bucket policy for CloudFront OAC must allow the distribution ARN.
- CloudFront `/api/*` behavior must use `CachingDisabled` and `AllViewer`.
- S3 CORS for presigned PUT: allowed origins = CloudFront domain + `http://localhost:5173`; methods = PUT; headers = `*`; expose `ETag`.
- CloudFront custom error responses: 403/404 → `/index.html` with 200 for SPA routing.
- Do not commit `*.tfstate*`, `.terraform/`, `*.tfvars` containing secrets.

### 4.5 Terraform Primer (for Tom)

Since Terraform is the least familiar area, this is the mental model we'll use and expand as we implement. A dedicated `docs/TERRAFORM.md` will be written during implementation.

- **Provider:** a plugin that talks to an API. We use `hashicorp/aws` (and possibly `hashicorp/archive`).
- **Resource:** a managed object, e.g. `aws_s3_bucket`, `aws_lambda_function`. Declared in HCL; Terraform creates/updates/deletes it.
- **Data source:** a read-only lookup, e.g. `aws_caller_identity`, `aws_region`, existing Route 53 zones.
- **Variable / local / output:** inputs (`var.stage`), computed values (`local.name_prefix`), exported values (`output.api_url`).
- **State:** a JSON map from Terraform resources to real AWS IDs. It is the source of truth for what Terraform manages. Store it remotely (S3), lock it, never commit it, and assume it can contain sensitive values.
- **Backend:** where state lives. `backend "s3"` + `use_lockfile = true`.
- **Module:** a reusable folder of resources with inputs/outputs. The root module is the env directory; it calls child modules.
- **Plan / apply:** `terraform plan` shows the diff; `terraform apply` executes it. Always read the plan before applying.
- **Dependency graph:** Terraform infers order from references (e.g., CloudFront references the API). `depends_on` is for hidden dependencies only.
- **Lifecycle:** `prevent_destroy`, `create_before_destroy`, `ignore_changes`.
- **Provider alias:** a second configuration of the same provider, e.g. `aws.us_east_1` for CloudFront certificates later.
- **Bootstrap:** the state bucket must exist before `terraform init` can use it. Hence `infra/bootstrap`.
- **Drift:** `terraform plan` detects manual console changes; Terraform will want to revert them.
- **Import:** `terraform import` adopts existing resources (not needed for greenfield).
- **Commands:** `init`, `fmt`, `validate`, `plan -out=tfplan`, `apply tfplan`, `destroy`, `state list`, `output`.

### 4.6 Local Development (Hybrid)

Proposed hybrid:
- `vite dev` locally.
- Real **dev** Cognito pool, DynamoDB table, and S3 bucket in AWS (near-zero cost).
- Vite proxy `/api` → dev execute-api or CloudFront URL, so the browser sees same-origin requests.
- Stability/Stripe test keys in SSM under `/token-designer/dev/...`.
- Stripe webhooks: `stripe listen --forward-to <dev webhook URL>` or Stripe Dashboard test events.
- MSW for UI-only work when offline.
- Seed script for a test user/profile/sheet.
- DynamoDB Local (Docker) for fast repository/integration tests; not required for manual UI dev.
- Dev stage can be destroyed/recreated freely; stateful resources in dev use `DESTROY`.
- Pin Node 22 via `.nvmrc` to match the Lambda runtime.

**Why:** avoids LocalStack/Cognito emulation complexity while keeping real-service behavior. Acceptable because this is a demo.

### 4.7 Cost Strategy & Monitoring

**Always-free / low-cost services:**
- Lambda: 1M requests + 400k GB-seconds/month (always free).
- CloudFront: 1 TB transfer + 10M requests/month (always free).
- Cognito Essentials: 10k MAU/month (free, no expiry).
- DynamoDB: 25 GB storage + 25 RCU/25 WCU (provisioned; on-demand has no free capacity units but costs pennies here).
- CloudWatch Logs: 5 GB/month free.
- SSM Parameter Store: standard parameters free (use standard, not advanced).
- ACM: free certificates.
- AWS Budgets: first 2 budgets free.
- CloudTrail: one management-events trail free.

**12-month free (legacy accounts):**
- API Gateway: 1M HTTP API calls/month.
- S3: 5 GB standard storage.
- SES: 3,000 message charges/month.

**New accounts (after 2025-07-15):** $200 credits + 6-month free plan instead of the 12-month model. Always-free services still apply.

**Region cost note:** us-west-2 (Oregon) is generally priced the same as us-east-1 for Lambda/S3/DynamoDB/API Gateway; us-west-1 (N. California) is often slightly more expensive. CloudFront is global and priced the same. ACM is free. Route 53 is not used initially.

**Paid usage to watch:**
- Stability AI generation (per image; Ultra is the most expensive).
- Stripe transaction fees.
- S3 storage beyond free tier and request charges.
- CloudFront invalidations beyond 1,000 paths/month (invalidate only `/index.html`).
- CloudWatch beyond free logs (set retention).
- Secrets Manager ($0.40/secret/month — avoid; use SSM SecureString).
- NAT Gateway (~$32/month — avoid; keep Lambda outside a VPC).
- WAF ($5/month — skip for demo).
- Customer-managed KMS keys ($1/key/month — use AWS-owned/default encryption).
- Provisioned Concurrency, X-Ray, RDS/Aurora, OpenSearch — avoid.

**Guardrails:**
- AWS Budgets: monthly cost budget with alerts at $1, $5, $10, $25 → `alerts@example.com`.
- AWS Cost Anomaly Detection with a low threshold → same email.
- Tag all resources (`Project`, `Stage`, `ManagedBy`) for cost allocation.
- Lambda reserved concurrency caps (e.g., API 10, workers 5).
- API Gateway stage throttling (e.g., 10 rps, burst 20).
- Per-user daily generation cap in DynamoDB (e.g., 20/day) to prevent abuse.
- CloudWatch log retention: 7 days dev, 30 days prod.
- S3 lifecycle: abort incomplete multipart uploads after 1 day; optional transition/expiry policy for full images.
- "Kill switch" SSM parameter (`/token-designer/<stage>/generation-enabled`) checked by the generation worker; flip to false to stop AI spend without a deploy.
- **AI cost telemetry:** each generation writes a `GenerationCount` / `EstimatedAICost` custom CloudWatch metric (or a daily DynamoDB counter). Alarm if daily count or estimated spend exceeds a threshold. Stability is external to AWS, so this is the only way to alert on it.
- Weekly/monthly Cost Explorer review; document in `docs/COSTS.md`.
- CloudWatch alarms: Lambda errors/throttles, API 5xx, DynamoDB throttles, Stripe webhook failures, generation failures → SNS email.

**Documented estimate:** at demo traffic, infra should be ~$0–2/month excluding AI and Stripe. AI is usage-based; Stripe is per transaction.

### 4.8 Domain & DNS (Deferred)

- **Use AWS default URLs for now:**
  - SPA + API: `https://<distribution-id>.cloudfront.net` (SPA at `/`, API at `/api/*`).
  - Stripe webhook: execute-api URL (server-to-server).
- No Route 53, ACM, or custom domain in v1.
- The frontend uses relative `/api` paths, so adding a custom domain later requires no frontend change.
- Later: ACM in us-east-1 for CloudFront, ACM in us-west-2 for API Gateway (or continue using the CloudFront proxy), Route 53 or external DNS CNAMEs.
- CloudFront default domain changes if the distribution is recreated; acceptable for a demo. The relative `/api` design means no rebuild is needed if the domain changes.

### 4.9 Security Fixes During Port

Must fix / avoid:
- **Never copy** the committed Firebase admin service-account JSON or `.env` into the new repo.
- Do not log secrets (current `images.ts` logs the Stability key).
- Derive `uid`/`email` from the Cognito JWT, never from client request bodies.
- Verify ownership on every read/write/delete (keys are scoped `USER#<sub>`; check path IDs).
- `getSessionStatus` must verify the Stripe session belongs to the caller.
- Stripe webhook: verify signature against the raw body; idempotent fulfillment via DynamoDB transaction/conditional write.
- Input validation with zod on every handler; allowlist image styles; cap prompt/description lengths.
- Presigned uploads: content-type allowlist, content-length range (e.g., 10 MB), validate/re-encode with sharp to strip EXIF, ULID object keys, no user-controlled paths.
- S3: block public access, OAC, least-privilege bucket policy, short presigned URL TTLs.
- IAM: one role per Lambda, least privilege; no wildcard resources where avoidable.
- CORS: same-origin proxy in prod; Vite proxy in dev. No `*` CORS config.
- Error responses: no stack traces/internal details to clients; structured logs with request IDs; redact tokens/PII.
- CSP/security headers: allow only self, Cognito, Stripe, and S3/CloudFront media.
- Secrets: SSM SecureString per stage (`/token-designer/<stage>/...`); no secrets in Vite env (only public config).
- Dependency hygiene: `npm audit`, Dependabot/Renovate, pin versions.
- CloudTrail management events on; no data events (cost).
- Repo hygiene: `.gitignore` for `.env*`, `.terraform/`, `*.tfstate*`, `*.tfvars` with secrets, `*.pem`, credentials; secret scanning (gitleaks/GitHub secret scanning) in pre-commit/CI.
- Per-user daily generation cap and API throttling to limit abuse.
- Document that tokens are stored in localStorage by Amplify; CSP mitigates XSS. Revisit if needed.

### 4.10 Data Model (DynamoDB)

Single table, on-demand, ULIDs for sortable IDs.

| Entity | PK | SK | Notes |
|---|---|---|---|
| Profile | `USER#<sub>` | `PROFILE` | `email`, `credits`, `createdAt`, `updatedAt` |
| Image | `USER#<sub>` | `IMAGE#<ulid>` | `name`, `description`, `style`, `thumbKey`, `fullKey`, `createdAt`, `status` |
| Sheet | `USER#<sub>` | `SHEET#<ulid>` | `name`, `template`, `images[]`, `createdAt` |
| Payment | `PAYMENT#<sessionId>` | `PAYMENT` | `userId`, `status`, `creditsGranted`, `processedEventIds`, timestamps |
| Job | `USER#<sub>` | `JOB#<ulid>` | `type`, `status`, `imageId`, `error`, `expiresAt` (TTL) |

Access patterns:
- Profile: `GetItem`.
- Images newest-first: `Query` with `begins_with(SK, "IMAGE#")`, `ScanIndexForward=false`.
- Sheets newest-first: same with `SHEET#`.
- Latest sheet: first result (matches current behavior).
- Add/remove image: read-modify-write sheet item (max 63).
- Delete image: delete S3 objects, delete image item, remove ID from all sheets.
- Credit decrement (if enabled): conditional `UpdateItem` with `credits >= :one`.
- Payment fulfillment: `TransactWriteItems` (payment status condition + user credit increment) for idempotency.

Notes:
- **On-demand billing** confirmed. Cost is pennies at demo scale.
- TTL on jobs.
- No GSI needed if ULIDs are sortable. Add a GSI later for admin/email lookup if needed.
- Encryption: AWS-owned key (default).
- PITR/backups off for demo; document for production.

### 4.11 Image Pipeline & Media Delivery

**Upload (replaces base64-through-function):**
1. `POST /api/images/upload-url` → create pending image record; return presigned S3 PUT URL + `imageId`.
2. Browser uploads directly to S3 (content-type/size constrained).
3. `POST /api/images/{id}/complete` → the `api` Lambda validates, strips EXIF, creates the thumbnail, and marks the image ready (synchronous; sharp layer attached).
4. Client invalidates/refetches `images`.

**Generation (avoids 30s API Gateway timeout):**
1. `POST /api/images/generate` → validate, create job (`pending`), async-invoke worker, return `202 { jobId }`.
2. Worker calls Stability, writes full + thumb to S3, creates image record, updates job (`succeeded`/`failed`).
3. Client polls `GET /api/jobs/{jobId}` with TanStack Query (`refetchInterval: 2000`) until terminal; then invalidates images.
4. On failure, mark job failed and (if credits are enforced) refund the credit.

**Storage keys:** `users/<sub>/images/<imageId>/full.png` and `thumb.png` (or `.webp` for thumbs).
**Thumbnail:** 512px inside, re-encode (strip EXIF).

**Media delivery (confirmed): presigned S3 GET URLs.**
- Lambda returns `getSignedUrl(GetObjectCommand, { expiresIn: 3600 })`.
- No CloudFront key pair, no private-key management, no cache-policy subtleties.
- Private bucket; presigned URLs are short-lived.
- No CDN caching; every image request hits S3. Negligible at demo traffic.
- Later upgrade: CloudFront signed URLs (key group + private key in SSM + OAC + cache policy that does not forward signature query params).

**Print:** current code prints thumbnails; exact port keeps that. Later improvement: print full-res.

### 4.12 TanStack Query

- Replace Zustand server-state services/subscriptions.
- Keep a thin `AuthContext` for Cognito user state.
- Query keys: `['profile', sub]`, `['images', sub]`, `['sheets', sub]`, `['job', jobId]`.
- Defaults: `staleTime: 30s`, refetch on window focus, `retry: 1`.
- Mutations invalidate relevant queries; optimistic updates for add/remove token and clear sheet.
- Generation job polling: 2s until terminal, then stop.
- Presigned URLs: refetch before expiry (e.g., staleTime 30 min for 1-hour URLs) or generate on demand.
- Logout: `queryClient.clear()`.
- Devtools only in dev.
- No real-time; focus refetch + mutation invalidation. Acceptable for demo.

### 4.13 Payments

- Keep Stripe embedded checkout.
- `POST /api/checkout/session` uses `sub`/email from JWT; stores payment record with intended credits.
- `GET /api/checkout/session/{id}` verifies ownership before returning status.
- `POST /api/webhooks/stripe` with no authorizer; verify signature with raw body; idempotent transaction.
- Stripe webhook URL options are discussed below (4.13.1).
- Price ID and publishable key moved to config (SSM/env); no hardcoding.
- Purchase UI remains disabled for now (exact port).
- Stripe test mode in dev; separate secrets per stage.
- Manual refunds for MVP; optional auto-refund worker later (matches existing Phase 1/2 plan).

#### 4.13.1 Stripe Webhook URL Options

**Option A — API Gateway execute-api URL (recommended for v1)**
`https://<api-id>.execute-api.us-west-2.amazonaws.com/api/webhooks/stripe`
- Direct to API Gateway; no CloudFront in the path.
- Server-to-server; CORS irrelevant.
- API Gateway passes the raw JSON body unchanged; `Stripe-Signature` header is available.
- Route has `authorization_type = "NONE"`; Stripe signature verification is the security boundary.
- Easy to test with `stripe listen --forward-to <execute-api URL>`.
- Stable unless the API is recreated.
- Downside: exposes the execute-api URL (it is public anyway), and if we later disable the execute-api endpoint to force CloudFront, the webhook must move.

**Option B — CloudFront `/api/webhooks/stripe`**
`https://<distribution>.cloudfront.net/api/webhooks/stripe`
- Single public domain; hides the execute-api URL; consistent with the SPA/API surface.
- Can add WAF/access logs at the edge later.
- Requires the `/api/*` behavior to use `CachingDisabled`, `AllViewer` (forward `Stripe-Signature`), and to preserve the raw body.
- More moving parts to debug if signature verification fails; CloudFront can retry origin requests, which is harmless with idempotency but adds noise.
- If we add a custom domain later, the webhook URL becomes branded.

**Option C — Dedicated Lambda Function URL**
`https://<url-id>.lambda-url.us-west-2.on.aws/`
- Bypasses API Gateway and CloudFront; single-purpose webhook function.
- No route/authorizer config; raw body and headers are direct.
- Downside: another endpoint/function to manage; no API Gateway access logs or throttling (reserved concurrency only); separate IAM.
- Good isolation if the webhook grows complex, but overkill for the current handler.

**Option D — API Gateway custom domain** (not now; no custom domain in v1).

**Recommendation:** Option A for v1. It has the fewest moving parts, preserves the raw body, and keeps the webhook independent of CloudFront. If we later want a single branded surface, switch to Option B and update the Stripe dashboard endpoint.

**Security notes (all options):**
- Verify `Stripe-Signature` against the raw body and the per-stage webhook secret.
- Make fulfillment idempotent with a DynamoDB transaction/conditional write keyed on the payment status.
- Respond `200` quickly; return `5xx` on transient failures so Stripe retries.
- Do not put the webhook behind the Cognito authorizer.

### 4.14 Testing

- Vitest + React Testing Library (replace CRA/Jest).
- Zod schemas shared between web and Lambdas.
- Lambda unit tests with mocked AWS SDK v3 clients.
- DynamoDB Local (Docker) integration tests for repository layer.
- Playwright E2E against the dev stage (Cognito test user).
- Stripe webhook fixtures / `stripe listen` for local forwarding.
- Basic smoke tests for auth, upload, generate (stubbed provider), sheet add/remove, checkout return.

### 4.15 Documentation & Architecture Standards (Discussion)

**Frameworks and standards worth referencing:**
- **AWS Well-Architected Framework** — six pillars (Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability). Use it as the review lens. Run the free AWS Well-Architected Tool review and summarize findings.
- **C4 model (Simon Brown)** — Context, Container, Component, Code. Use Level 1 (Context) and Level 2 (Container) for this app; add a deployment diagram and sequence diagrams. Skip Level 4.
- **arc42** — a pragmatic 12-section architecture documentation template. Use it as the outline for the SAD, but keep each section concise.
- **ISO/IEC/IEEE 42010** — the formal standard for architecture descriptions (stakeholders, concerns, viewpoints, views). Cite it; don't reproduce it.
- **Architecture Decision Records (ADRs)** — Michael Nygard format: Context, Decision, Consequences. Immutable; supersede rather than edit. Store in `docs/adr/`.
- **OWASP ASVS / Top 10 + STRIDE** — security requirements and threat modeling.
- **FinOps Foundation** — cost visibility, budgets, guardrails.
- **Google SRE** — SLIs/SLOs, error budgets, runbooks.
- **12-Factor App** — operational discipline for the web app.
- **Diátaxis** — organize docs into tutorials, how-to, reference, explanation.
- **TOGAF / ArchiMate** — enterprise architecture frameworks. Mention as context; overkill for this project.

**Artifact set a Solution Architect would typically produce:**
- `README.md` — quickstart and links to all docs.
- `docs/PLAN.md` — delivery plan: milestones, tasks, dependencies, acceptance criteria, risks.
- `docs/ARCHITECTURE.md` — arc42-lite SAD: goals, constraints, context, solution strategy, building blocks, runtime views, deployment, data, API, security, reliability, observability, cost, testing, risks.
- `docs/adr/NNNN-*.md` — one ADR per significant decision.
- `docs/REQUIREMENTS.md` — functional and non-functional requirements with IDs.
- `docs/COSTS.md` — estimate, free-tier caveats, guardrails, alert thresholds.
- `docs/SECURITY.md` — threat model, controls, data classification, secrets handling.
- `docs/RUNBOOK.md` — operations, alarms, common failures, rollback.
- `docs/TESTING.md` — test strategy and environments.
- `docs/TERRAFORM.md` — Terraform primer and conventions.
- `docs/diagrams/*.mmd` — diagrams-as-code.
- `docs/RAID.md` or a risk register section — Risks, Assumptions, Issues, Dependencies.
- `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS` — repo hygiene.

**Diagram plan (C4 + supporting views):**
1. **C4 Level 1 — System Context:** the user, the SPA, AWS services, Stripe, Stability AI.
2. **C4 Level 2 — Container:** CloudFront, S3 web bucket, API Gateway, Lambdas, DynamoDB, S3 media, Cognito, SSM, CloudWatch/SNS.
3. **Deployment diagram:** AWS account, region us-west-2, environments, external services, trust boundaries.
4. **Sequence diagrams:** registration/login, presigned upload, async generation job, Stripe checkout/webhook.
5. **Data flow / trust-boundary diagram** for the security section (data classification, auth boundaries).

**Diagram best practices:**
- One concern per diagram; title, legend, date/version.
- Show boundaries (AWS account, region, VPC if any, trust zones).
- Label protocols (HTTPS), direction, sync vs async.
- Use official AWS Architecture Icons for polished stakeholder versions.
- Keep diagrams as code (Mermaid in Markdown, or Structurizr DSL / C4-PlantUML) so they are reviewable and versioned.
- Export SVG/PNG for stakeholders; keep the source in the repo.
- Don't let diagrams drift from the code/infra; review them in PRs.

**Discipline signals:**
- ADRs with alternatives considered and consequences, not just the chosen option.
- NFRs with measurable targets and a verification method (e.g., p95 latency < 500 ms; alarm on 5xx > 1%).
- Requirements traceability: requirement → design component → test.
- Risk register with likelihood, impact, mitigation, owner.
- Explicit assumptions, constraints, and **non-goals**.
- Cost model and guardrails treated as first-class design concerns.
- Threat model and a controls matrix.
- Operational readiness review and a runbook.
- Test strategy covering unit, integration, E2E, security, and cost/load sanity.
- Rollback and disaster-recovery plan.
- Peer review / architecture review, with comments and resolutions recorded.
- Versioned docs with status (Draft/Proposed/Accepted/Superseded), date, author.
- Definition of Done and acceptance criteria per milestone.
- AWS Well-Architected review and a short post-implementation review.

**What not to overdo:**
- Don't produce a 100-page TOGAF document for a demo. Match rigor to risk.
- Avoid UML unless a specific stakeholder needs it; C4 + sequence diagrams are enough.
- Don't write NFRs you can't measure.
- Don't let the plan, architecture, ADRs, and runbook blur into one document.
- Don't claim compliance or resilience you haven't verified.

**Proposed doc set for this project:**
```
docs/
  PLAN.md
  ARCHITECTURE.md
  REQUIREMENTS.md
  COSTS.md
  SECURITY.md
  RUNBOOK.md
  TESTING.md
  TERRAFORM.md
  RAID.md
  adr/
    0001-use-terraform.md
    0002-http-api-over-function-urls.md
    0003-same-origin-cloudfront-proxy.md
    0004-presigned-s3-media.md
    0005-dynamodb-single-table-on-demand.md
    0006-custom-cognito-forms-auto-confirm.md
    0007-stripe-webhook-execute-api-url.md
    0008-cost-guardrails.md
  diagrams/
    c4-context.mmd
    c4-container.mmd
    deployment.mmd
    sequence-auth.mmd
    sequence-upload.mmd
    sequence-generation.mmd
    sequence-payment.mmd
```

### 4.16 Public Repository Policy (Confirmed)

**Decision:** the repository may be public. Assume anyone can read it; security must not depend on secrecy.

**Safe to publish:**
- Architecture docs, C4 diagrams, deployment/sequence diagrams.
- ADRs and decision rationale.
- Application code, Terraform modules, tests.
- Cost estimates and guardrail strategy.
- High-level security posture and controls matrix.
- Runbooks without secrets or account-specific details.
- Requirements, RAID log, testing strategy.

**Never commit (even in a private repo):**
- `.env`, API keys, Stripe secret/webhook secret, Stability key.
- Firebase service-account JSON, private keys, certificates.
- Terraform state (`*.tfstate*`), `.terraform/`, plan output.
- `*.tfvars` containing secrets.
- Customer data or real user data.

Use SSM SecureString, GitHub Secrets, or a private `terraform.tfvars` that is gitignored.

**Redact/placeholder in public docs:**
- AWS account ID and exact ARNs/resource IDs.
- Personal email addresses — use `alerts@example.com`; the real alert address lives in private config.
- Internal hostnames, IPs, private endpoints.
- Exact billing figures if they reveal business scale.
- Detailed threat models / known weaknesses — publish a high-level controls matrix, keep attack-path detail private.
- Screenshots containing emails, tokens, or user data.

**Repo hardening if public:**
- `.gitignore` from day one; run `gitleaks`/`trufflehog` before the first push.
- GitHub secret scanning, Dependabot, CodeQL (free for public repos).
- Branch protection: PR reviews and required status checks.
- `SECURITY.md` with a vulnerability disclosure policy.
- `LICENSE` (MIT/Apache-2.0, or a restrictive license/private repo if protecting the business idea).
- `CONTRIBUTING.md`, `CODEOWNERS`.
- GitHub Actions with OIDC (no long-lived AWS keys); restrict the role trust policy to the repo/branch; use environments with approvals for prod; be careful with `pull_request_target` and fork PRs.
- Never commit Terraform state or plan output.

**Note:** making a repo public and then private does not erase forks/caches. Decide before the first push; start clean.

---

## 5. Proposed Repo Layout

```
aws-token-designer/
  apps/web/                 # Vite + React 19 + TS
    src/
  services/api/             # HTTP API Lambda handlers
  services/workers/         # generation + image processing Lambdas
  packages/shared/          # types, zod schemas, API client
  infra/
    bootstrap/
    modules/
    envs/{dev,prod}/
  docs/                     # cost strategy, Terraform primer, runbooks
  scripts/                  # seed, build-lambda, migrate helpers
  .nvmrc                    # Node 22
  package.json              # npm workspaces
```

---

## 6. Proposed Phases

1. **Scaffold + Terraform bootstrap:** workspaces, Vite, Node 22 pin, Terraform state bucket, dev env skeleton.
2. **Foundation infra:** Cognito (pre-sign-up auto-confirm), DynamoDB table, S3 buckets, SSM parameter names, IAM.
3. **Core API + web:** `/api/me`, sheets CRUD, image upload presign/list/delete, TanStack Query wiring, auth forms. Deploy dev.
4. **AI generation:** async job + polling, Stability integration, thumbnails, daily cap, kill switch, AI cost metric.
5. **Payments:** checkout, webhook, return page, idempotency.
6. **Web hosting/CDN:** CloudFront distribution with SPA default behavior + `/api/*` proxy, S3 deployment, SPA error responses, security headers.
7. **Polish:** tests, observability, budgets/alarms, cost docs, production env.
8. **Later:** custom domain, print quality, multiple sheets, account page, enable purchases, CloudFront signed URLs.

---

## 7. Decision Log

| Date | Decision | By |
|---|---|---|
| 2026-11-09 | Exact port for now; improvements later | Tom |
| 2026-11-09 | No existing users/data; no migration | Tom |
| 2026-11-09 | Keep Stability AI; AI costs acceptable | Tom |
| 2026-11-09 | Keep Stripe flow as-is for now | Tom |
| 2026-11-09 | Hybrid local/dev-AWS acceptable | Tom |
| 2026-11-09 | Document cost strategy + alerts | Tom |
| 2026-11-09 | Fix security issues during port | Tom |
| 2026-11-09 | Custom auth forms + Amplify Auth | Tom |
| 2026-11-09 | Simplest login UX for now | Tom |
| 2026-11-09 | Terraform for IaC | Tom |
| 2026-11-09 | Prefer west-coast region if no cost penalty | Tom |
| 2026-11-09 | API Gateway HTTP API (not Function URLs) | Tom |
| 2026-11-09 | Presigned S3 for media (CloudFront signed URLs later) | Tom |
| 2026-11-09 | DynamoDB on-demand | Tom |
| 2026-11-09 | Terraform stack: S3 native lock, modules + env dirs, zip + sharp layer, manual apply first | Tom |
| 2026-11-09 | Region: us-west-2 | Tom |
| 2026-11-09 | Use AWS default URLs for now; no custom domain/DNS | Tom |
| 2026-11-09 | Budget alerts to a private address (placeholder in public docs) | Tom |
| 2026-11-09 | Same-origin CloudFront `/api/*` proxy | Adopted (recommended) |
| 2026-11-09 | Keep generation free + per-user daily cap | Adopted (recommended) |
| 2026-11-09 | Print thumbnails for now | Adopted (exact port) |
| 2026-11-09 | npm workspaces repo layout | Adopted (recommended) |
| 2026-11-09 | Node 22 pinned via `.nvmrc` | Tom |
| 2026-11-09 | Keep `orders@example.com` on Return page for now | Tom |
| 2026-11-09 | Stripe webhook uses execute-api URL (Option A) | Tom |
| 2026-11-09 | Repository may be public with a public-safe policy | Tom |
| 2026-11-09 | Real alert email kept in private config; placeholder in docs | Tom |

---

## 8. Remaining Questions

None blocking. Proceeding to the official plan (`docs/PLAN.md`) and architecture document (`docs/ARCHITECTURE.md`), using the full documentation set described in 4.15.
