# Terraform Primer (this stack)

> Phase 1 foundation. Each concept below maps to a concrete file in this repo.

## Provider

The AWS plugin Terraform uses to create resources. Version pinned so every
machine gets the same behavior.

- `infra/envs/dev/versions.tf` — `hashicorp/aws ~> 5.0`, `hashicorp/archive >= 2.0`
- `infra/bootstrap/versions.tf` — same AWS pin for the state bucket
- Each module has its own `versions.tf` restating what it needs
- Region is set once: `provider "aws" { region = var.region }` in
  `infra/envs/dev/main.tf` (default `"us-west-2"` in `variables.tf`;
  bootstrap uses `var.region` the same way)

## Resource

One AWS object managed by Terraform. Examples in this stack:

| AWS object | File |
|---|---|
| Cognito user pool + app client | `infra/modules/cognito/main.tf` (`aws_cognito_user_pool`, `aws_cognito_user_pool_client`) |
| Pre-sign-up auto-confirm Lambda + role + permission | `infra/modules/cognito/main.tf` (`aws_lambda_function`, `aws_iam_role`, `aws_lambda_permission`) |
| DynamoDB single table | `infra/modules/dynamodb/main.tf` (`aws_dynamodb_table`) |
| Web + media buckets, encryption, lifecycle | `infra/modules/storage/main.tf` (`aws_s3_bucket`, `..._lifecycle_configuration`, ...) |
| CloudFront distribution, OAC, SPA rewrite function, security headers | `infra/modules/cloudfront/main.tf` (`aws_cloudfront_distribution`, `..._origin_access_control`, `..._function`, `..._response_headers_policy`) |
| Media bucket CORS (presigned PUT) | `infra/modules/cloudfront/main.tf` (`aws_s3_bucket_cors_configuration`) |
| SNS topic + topic policy + email subscription | `infra/modules/monitoring/main.tf` (`aws_sns_topic`, `aws_sns_topic_policy`, `aws_sns_topic_subscription`) |
| Monthly budget | `infra/modules/monitoring/main.tf` (`aws_budgets_budget`; Cost Anomaly Detection is account-level and intentionally not managed) |
| State bucket (+ versioning, SSE-S3, public-access block) | `infra/bootstrap/main.tf` |

## State

Terraform's record of what it created (a JSON snapshot per environment).
Commands read state to plan the smallest change that reaches the config.

- Separate state per env: `dev` key `dev/terraform.tfstate`, `prod` key
  `prod/terraform.tfstate` (same bucket; `infra/envs/prod/backend.hcl.example`)
- Never hand-edit state; inspect with `terraform show` / `terraform state list`
- State may contain IDs/ARNs but **never secret values** in this stack —
  SSM values are created out-of-band (see "SSM secrets" below)

## Backend

Where state lives. Here: the S3 bucket from `infra/bootstrap`, with native
locking (`use_lockfile = true`, no DynamoDB lock table needed on
Terraform >= 1.10).

- `infra/envs/dev/backend.tf` — intentionally an **empty** `backend "s3" {}`
  block. Backend blocks take no variables, so real values are injected at
  `init` time from a gitignored file
- `infra/envs/prod/backend.hcl.example` — copy to `backend.hcl` (gitignored)
  and fill in the real bucket name from the bootstrap output; the key is
  `prod/terraform.tfstate`
- Init: `terraform -chdir=infra/envs/dev init -backend-config=backend.hcl`
  (same pattern for `prod`)

## Module

A reusable folder of `.tf` files with its own variables/outputs.
Envs compose modules; modules never hardcode the stage.

- `infra/modules/cognito/` — user pool (email sign-in via
  `username_attributes`, 8-char password, MFA off, advanced security off),
  secret-less app client (`ALLOW_USER_PASSWORD_AUTH` +
  `ALLOW_USER_SRP_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`), inline Node
  pre-sign-up handler zipped with `archive_file`. No hosted UI domain
- `infra/modules/dynamodb/` — one on-demand table, string PK/SK, TTL on
  `expiresAt`, AWS-owned encryption, PITR off (commented, demo default)
- `infra/modules/storage/` — private web + media buckets (ownership
  controls, public-access-blocked, SSE-S3); both buckets abort incomplete
  multipart uploads after 1 day. Phase 5 moved the media CORS rule and the
  web-bucket OAC policy to the `cloudfront` module (both need the distribution)
- `infra/modules/cloudfront/` — one default CloudFront URL for the SPA and
  the same-origin `/api/*` proxy (see "Phase 5 additions" below)
- `infra/modules/monitoring/` — SNS topic + topic policy + email subscription
  (`var.alert_email`, placeholder `alerts@example.com`), monthly budget with
  $1/$5/$10/$25 thresholds, and the CloudWatch alarm matrix (AI count/cost,
  API 5xx, Lambda errors/throttles, DynamoDB throttles — see "Phase 6
  additions")
- Wiring: `infra/envs/dev/main.tf` calls every module with shared tags

## Plan / Apply

`plan` previews, `apply` executes. Always review the plan first.

```sh
# 1. Bootstrap (once per account):
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply -var=state_bucket_name=YOUR-UNIQUE-NAME

# 2. Dev env (backend.hcl filled in from the bootstrap output):
terraform -chdir=infra/envs/dev init -backend-config=backend.hcl
terraform -chdir=infra/envs/dev plan -out=tfplan
terraform -chdir=infra/envs/dev apply tfplan
```

CI runs `terraform fmt -check` + `validate` for every module and both envs;
an optional OIDC job plans `dev` when the repo variables `AWS_PLAN_ROLE_ARN`
and `TF_STATE_BUCKET` are set (see "CI Terraform plan" below). Manual `apply`
first.

## CI Terraform plan (optional)

`.github/workflows/ci.yml` has a `terraform-plan` job that **skips unless**
these repository variables are configured (Settings → Secrets and variables →
Actions → Variables):

| Variable | Purpose |
|---|---|
| `AWS_PLAN_ROLE_ARN` | OIDC role assumed by `aws-actions/configure-aws-credentials`. Must trust this repository/branch and have **read-only** access to the state bucket plus read-only AWS APIs for refresh. |
| `TF_STATE_BUCKET` | State bucket name from `infra/bootstrap` (required for the job to run). |
| `TF_STATE_KEY` | State key, normally `dev/terraform.tfstate`. |
| `TF_STATE_REGION` | State bucket region (defaults to `us-west-2`). |

The job never applies and runs `plan -lock=false`, so it does not write a
state-lock object (the role only needs read access). It builds the API bundles
and a placeholder sharp layer so `archive_file` can hash inputs, then runs
`init` with `-backend-config` flags and `plan` for `infra/envs/dev`. The `if`
condition requires both `AWS_PLAN_ROLE_ARN` and `TF_STATE_BUCKET`; without
them the job is skipped, so forks stay green without AWS credentials. Keep it
non-required.

### Optional E2E job

The `e2e` job skips unless the repository variables below exist; `secrets`
cannot be used in a job-level `if`, so the run step exits 0 when the credentials
are absent. Configure (Settings → Secrets and variables → Actions):

| Kind | Name | Purpose |
|---|---|---|
| Variable | `E2E_ROLE_ARN` | OIDC role for the spec's optional Cognito cleanup (delete the registration user). |
| Variable | `E2E_BASE_URL` | Deployed stage URL (e.g. the `web_url` output). |
| Variable | `E2E_USER_POOL_ID` | Optional; Cognito pool id for cleanup. |
| Variable | `AWS_REGION` | Optional; defaults to `us-west-2`. |
| Secret | `E2E_EMAIL` | Seeded account email for the login journey. |
| Secret | `E2E_PASSWORD` | Seeded account password. |

Seed the account before enabling the job (`TF_ENV=<env> SEED_EMAIL=...
SEED_PASSWORD=... npm run seed --workspace @aws-token-designer/api`). The job
runs `npm ci`, installs Chromium, assumes the OIDC role, and runs `npm run e2e`
with `E2E_BASE_URL`/`E2E_EMAIL`/`E2E_PASSWORD`/`E2E_USER_POOL_ID` from the
variables/secrets. Without the variables it is skipped; without the secrets the
run step is a no-op success.

## prevent_destroy / deletion protection

Prod stateful resources must survive an accidental `terraform destroy`; dev is
allowed to be torn down.

**Terraform limitation:** `lifecycle.prevent_destroy` accepts **only literal
values** (variables/locals are rejected: "Variables may not be used here"). The
modules instead expose a `prevent_destroy` input (default `false`) and use the
closest valid, prod-gated mechanism:

| Module | Mechanism |
|---|---|
| `dynamodb` | `deletion_protection_enabled = var.prevent_destroy` (native DynamoDB protection; prod `true`). |
| `cognito` | `deletion_protection = var.prevent_destroy ? "ACTIVE" : "INACTIVE"` (native user-pool protection; prod `true`). |
| `storage` | Prod-only `aws_s3_bucket_policy.media_delete_protection` denies `s3:DeleteBucket` on the media bucket (`count = var.prevent_destroy ? 1 : 0`). Dev gets no policy and stays destroyable. |
| `cloudfront` | Prod-only `Deny s3:DeleteBucket` statement appended to the existing web-bucket policy (`var.protect_from_deletion`, prod `true`). Dev leaves it off. |

Why a bucket policy: S3 has no native deletion-protection attribute, and
`lifecycle` cannot read a variable. An explicit `Deny` wins over the operator's
IAM `Allow`, so `terraform destroy` fails at `DeleteBucket`. This protects
against IAM principals (the normal operator/deploy path); the AWS account root
is not constrained by bucket policies, so treat it as defence-in-depth rather
than an absolute lock.

`infra/envs/prod` passes `prevent_destroy = true` to dynamodb/storage/cognito
and `protect_from_deletion = true` to cloudfront. Dev leaves all of them false,
so `terraform destroy` works for cleanup.

## Bootstrap

The chicken-and-egg fix: state needs an S3 bucket, but Terraform creates
buckets. So `infra/bootstrap/` is applied **first**, with local state,
before any env points its backend at the bucket.

- Creates: versioned, SSE-S3, public-access-blocked bucket
  (`infra/bootstrap/main.tf`)
- Outputs the bucket name/ARN (`infra/bootstrap/outputs.tf`) — paste the
  name into `infra/envs/dev/backend.hcl`
- Bucket name comes from `-var=state_bucket_name=...` so the real name
  (which may embed the account ID) never lands in the repo

## Drift

When reality differs from state (someone clicked in the console).
Detect with `terraform plan` (it shows unexpected diffs); fix by changing
the config (preferred) or, rarely, `terraform apply -refresh-only`.
 keeping all changes in code is what keeps `plan` clean (Definition of Done).

## SSM secrets

Terraform stores **names only** — never secret values.

- Names live in `locals.ssm_parameter_names` in `infra/envs/dev/main.tf`:
  `/token-designer/<stage>/stripe/secret`,
  `.../stripe/webhook-secret`, `.../stability/api-key`,
  `.../generation-enabled`
- Create values out-of-band after apply (example):

```sh
aws ssm put-parameter --name "/token-designer/dev/stripe/secret" \
  --type SecureString --value "sk_test_..." --region us-west-2
aws ssm put-parameter --name "/token-designer/dev/stripe/webhook-secret" \
  --type SecureString --value "whsec_..." --region us-west-2
aws ssm put-parameter --name "/token-designer/dev/stability/api-key" \
  --type SecureString --value "sk-..." --region us-west-2
aws ssm put-parameter --name "/token-designer/dev/generation-enabled" \
  --type String --value "true" --region us-west-2
```

Lambda env vars will reference these parameter names (Phases 2–3), not values.

## Alert email

`alert_email` defaults to the placeholder `alerts@example.com` so the repo stays
public-safe. **Pass the real address on every apply** (via `-var` or a
gitignored tfvars file):

```sh
terraform -chdir=infra/envs/dev apply -var="alert_email=<private-address>"
```

If you apply without it after a deployment that used a real address, Terraform
plans an SNS subscription replacement (destroy + create), which drops the
confirmed subscription until the new address confirms. Check the plan for
`aws_sns_topic_subscription.email must be replaced`.

## Tags

Every resource carries `Project=token-designer`, `Stage=<env>`,
`ManagedBy=terraform` via `default_tags` in `infra/envs/dev/main.tf` plus
`local.tags` passed into each module.

## Deferred to later phases

- Custom domain + ACM certificate + Route 53 alias — later (the distribution
  already outputs `distribution_hosted_zone_id` for that step)
- Cost Anomaly Detection — blocked by the account quota (a DIMENSIONAL monitor
  already exists); revisit if the quota is raised

## Phase 2 additions

- `infra/modules/lambda/` — `api` Lambda (nodejs22.x, arm64, 1024 MB), least-
  privilege IAM (table + media bucket + logs), log group, and the `sharp`
  Lambda layer. Reserved concurrency is configurable
  (`reserved_concurrency`, default `-1` = unreserved): PLAN 7.6 asks for 10,
  but the dev account's Lambda concurrency limit is 10, leaving no headroom
  for a reservation — `infra/envs/dev` therefore runs unreserved, and prod
  should set 10 once the quota allows. The bundle
  (`apps/api/dist/index.mjs`) comes from `scripts/build-lambda.sh`; the layer
  content (`apps/api/dist/sharp-layer`) from `scripts/build-sharp-layer.sh`
  (Docker, arm64, glibc base). Both artifacts must exist before `apply`.
  Verify the layer + bundle together with
  `./scripts/smoke-sharp-layer.sh` (runs the emitted bundle in an arm64
  container with the layer mounted at `/opt/nodejs/node_modules` and proves
  sharp resolves from the layer and processes a PNG).
- `infra/modules/api/` — HTTP API, stage `api`, Cognito JWT authorizer
  (issuer derived from the user pool id), Lambda proxy integration, access
  logs, throttling 10 rps / burst 20.
- `infra/modules/dynamodb/` — added the `byId` GSI (hash `entityId`, ALL
  projection). Image/sheet items carry `entityId` so the API can answer 403
  (owned by another user) vs 404 (missing) for cross-user ids.
- Dev outputs added: `api_url`, `api_lambda_name`, `sharp_layer_arn`.

## Phase 3 additions (AI generation)

- `infra/modules/lambda/` — added the `generateWorker` Lambda:
  - `nodejs22.x`, `arm64`, 1024 MB, **timeout 120s**, same Docker-built
    `sharp` layer as `api`.
  - Bundle: `apps/api/dist/worker.mjs`, produced by
    `npm run build --workspace @aws-token-designer/api` (or
    `./scripts/build-lambda.sh`). Both `index.mjs` and `worker.mjs` must exist
    before `apply`.
  - Log group `/aws/lambda/token-designer-<stage>-generate-worker`, 7-day
    retention.
  - IAM (least privilege): table read/write + `byId` GSI query, media bucket
    get/put/delete, `ssm:GetParameter` on exactly
    `/token-designer/<stage>/stability/api-key` and
    `/token-designer/<stage>/generation-enabled`, `kms:Decrypt` on the
    **key ARN** returned by `data.aws_kms_alias.ssm` (SecureString), and logs.
    KMS does not resolve alias ARNs in an IAM `Resource`, so the module looks
    the AWS-managed `alias/aws/ssm` key up and grants on
    `target_key_arn`.
  - Env: `TABLE_NAME`, `MEDIA_BUCKET`, `STABILITY_PARAM_NAME`,
    `KILL_SWITCH_PARAM_NAME`, `STAGE`.
  - **No reserved concurrency** (dev account limit is 10); see PLAN §7.6.
  - The `api` function now gets `WORKER_FUNCTION_NAME` and
    `lambda:InvokeFunction` scoped to the worker ARN only.
- `infra/modules/api/` — routes `POST /images/generate` and
  `GET /jobs/{jobId}` (both JWT-authenticated).
- `infra/modules/monitoring/` — two daily alarms wired to the existing SNS
  alerts topic:
  - `generation-count-daily`: `GenerationCount` (Sum, 86400s) >
    `var.daily_generation_alarm_threshold` (default 50/day).
  - `estimated-ai-cost-daily`: `EstimatedAICost` (Sum, 86400s) >
    `var.daily_ai_cost_alarm_threshold_usd` (default $5/day).
  - Namespace `TokenDesigner`, dimension `Stage=<stage>` — must match the
    worker EMF output (`apps/api/src/lib/metrics.ts`).
- SSM parameter names are unchanged from Phase 1
  (`/token-designer/<stage>/stability/api-key` SecureString and
  `/token-designer/<stage>/generation-enabled` String); only the names are in
  Terraform.

## Phase 4 additions (Stripe payments)

Terraform carries configuration **names** and non-secret values only; Stripe
keys stay out-of-band in SSM SecureString.

- `infra/modules/api/` — three routes:
  - `POST /checkout/session` (JWT)
  - `GET /checkout/session/{id}` (JWT; ownership checked in the handler)
  - `POST /webhooks/stripe` (authorization `NONE`; Stripe signature is the auth)
  The webhook is reached at
  `https://<api-id>.execute-api.<region>.amazonaws.com/api/webhooks/stripe`
  (the `api_url` output plus `/webhooks/stripe`).
- `infra/modules/lambda/` — `api` Lambda environment additions:
  - `STRIPE_PRICE_ID` — non-secret price id (`stripe_price_id`, default `""`;
    empty makes checkout answer `503 BILLING_DISABLED`).
  - `STRIPE_SECRET_PARAM_NAME` /
    `STRIPE_WEBHOOK_SECRET_PARAM_NAME` — SSM parameter names from
    `local.ssm_parameter_names` in `infra/envs/dev`.
  - `WEB_ORIGIN` — SPA origin for the embedded Checkout `return_url`
    (dev default is empty until it is set to the CloudFront URL; see Phase 5).
  - `CREDITS_PER_PURCHASE` — server-controlled credits per purchase
    (default `10`).
- `infra/modules/lambda/` — `api` IAM additions:
  - `dynamodb:TransactWriteItems` on the table (the webhook's atomic
    payment + profile-credit transaction).
  - `ssm:GetParameter` on exactly the two Stripe parameter ARNs.
  - `kms:Decrypt` on the `data.aws_kms_alias.ssm.target_key_arn` key ARN
    (KMS does not accept alias ARNs in an IAM `Resource`).
- `infra/envs/dev/variables.tf` — `stripe_price_id` (default `""`),
  `web_origin` (Phase 5 changed the dev default to `""`; set it to the CloudFront URL after the first apply — see the Phase 5 section), `credits_per_purchase`
  (default `10`). Pass the real test-mode price id with `-var` or a gitignored
  tfvars file; it is not a secret.
- No new Lambda functions or resources: the existing `api` function serves the
  routes and the existing table stores payments.

## Phase 5 additions (CloudFront hosting)

`infra/modules/cloudfront/` serves the SPA and the API from one CloudFront
default URL (PLAN 7.4, ADR-0003). No custom domain, ACM certificate, or Route
53 record in v1.

- **Origins**
  - `web` — the S3 web bucket's `bucket_regional_domain_name`, authorized by
    an Origin Access Control (OAC; SigV4, `always`).
  - `api` — the execute-api domain from the api module's `api_domain_name`
    output (`<id>.execute-api.<region>.amazonaws.com`), `https-only`, TLS 1.2.
- **Behaviors**
  - default `/*` → S3; managed `CachingOptimized`
    (`658327ea-f89d-4fab-a63d-7e88639e58f6`), compress, redirect-to-https.
  - `/api/*` → execute-api; managed `CachingDisabled`
    (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) and
    `AllViewerExceptHostHeader` (`b689b0a8-53d0-40ab-baf2-68738e2966ac`), so
    Authorization/body/query strings reach the API but the viewer's `Host` does
    not replace execute-api's own host. All methods GET/HEAD/OPTIONS/PUT/POST/
    PATCH/DELETE. API responses are never cached.
  - `HEAD /health` was added to the api module: HTTP APIs have no implicit
    HEAD→GET route, and the verification/monitoring probe is `curl -I`
    (Hono serves HEAD as GET once the request reaches Lambda).
- **SPA deep links — deviation from the PLAN wording.** PLAN 7.4 and the issue
  text mention `403/404 -> /index.html`; CloudFront `custom_error_response` is
  distribution-wide, so it would also rewrite real API statuses (cross-user
  `403`, missing `404`) into `index.html` 200. The module therefore leaves
  `custom_error_response` **unset** and attaches a CloudFront Function
  (viewer-request, default behavior only) that rewrites extensionless paths to
  `/index.html`, preserving the query string
  (e.g. `/return?session_id=...`). Asset paths contain a dot and are untouched;
  `/api/*` never reaches the function because it is a separate behavior.
- **Security headers** — `aws_cloudfront_response_headers_policy` on both
  behaviors: HSTS (1 year, includeSubdomains), `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and a CSP with `default-src 'self'`,
  same-origin scripts, inline styles (React style attributes), Cognito +
  `*.amazonaws.com` (presigned media) + `api.stripe.com` in `connect-src`,
  `frame-src https://js.stripe.com`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'`.
- **Price class** `PriceClass_100` (cheapest edges), IPv6 enabled, and
  `wait_for_deployment` (`var.wait_for_deployment`, default `true`).
- **OAC bucket policy** — `aws_s3_bucket_policy` on the web bucket:
  service principal `cloudfront.amazonaws.com`, `s3:GetObject` on
  `${web_bucket_arn}/*`, `StringEquals AWS:SourceArn = <distribution arn>`.
- **Media CORS move** — `aws_s3_bucket_cors_configuration.media` moved from
  `storage` to `cloudfront` because its allowed origins now include
  `https://<distribution domain>`. Allowed origins are
  `var.media_allowed_origins` (default `http://localhost:5173`) plus the
  distribution origin; PUT, `*` headers, `ETag` exposed, 3000 s max age. Do not
  add a second CORS resource in `storage` — S3 has one CORS singleton per
  bucket. The resource is moved in place via the root-level `moved` block in
  `infra/envs/dev/main.tf`, so the plan shows an update, not a delete/create.
- **Outputs** — `distribution_id`, `distribution_domain_name`,
  `distribution_arn`, `distribution_hosted_zone_id`; dev adds `web_url`,
  `cloudfront_distribution_id`, `cloudfront_domain_name`, `aws_region`.
- **`WEB_ORIGIN` cycle** — the Stripe return URL stays an input
  (`var.web_origin`, default `""`) instead of referencing the distribution,
  which would create distribution → api → lambda → distribution. After the
  first apply, set it once:

  ```sh
  terraform -chdir=infra/envs/dev apply \
    -var="web_origin=$(terraform -chdir=infra/envs/dev output -raw web_url)"
  ```

  Stripe is disabled in dev, so this is optional there.
- **Deploy** — `scripts/deploy-web.sh` builds the SPA with the public
  Cognito/region outputs, syncs `apps/web/dist`, and invalidates only
  `/index.html`. The Playwright smoke can target the deployed URL with
  `E2E_BASE_URL="$(terraform -chdir=infra/envs/dev output -raw web_url)" npm run e2e`
  (no local Vite server is started). See docs/TESTING.md.

## Phase 6 additions (hardening, docs, prod)

- **`infra/envs/prod/`** — same module composition as dev, `stage = "prod"`,
  state key `prod/terraform.tfstate`, `alert_email` placeholder (real value
  passed at apply), `web_origin = ""`, `media_allowed_origins = []` (only the
  CloudFront origin is allowed), `reserved_concurrency = -1` (account limit),
  and `prevent_destroy = true` for dynamodb/storage/cognito plus
  `protect_from_deletion = true` for the web-bucket policy.
- **Log retention** — `infra/modules/lambda`, `infra/modules/api`, and
  `infra/modules/cognito` take `log_retention_days` (default 7). Prod passes 30
  for both Lambda log groups, the API Gateway access log, and the Cognito
  pre-sign-up Lambda log group; dev keeps 7.
- **Alarm matrix** (`infra/modules/monitoring`, all to the SNS alerts topic,
  `period = 300`, one evaluation, threshold 1, `notBreaching`):

  | Alarm suffix | Namespace / metric | Dimensions |
  |---|---|---|
  | `api-5xx` | `AWS/ApiGateway` `5xx` | `ApiId`, `Stage=api` (the HTTP API stage is literally `api`) |
  | `api-lambda-errors` | `AWS/Lambda` `Errors` | `FunctionName=<api>` |
  | `worker-lambda-errors` | `AWS/Lambda` `Errors` (crashes only) | `FunctionName=<worker>` |
  | `api-lambda-throttles` | `AWS/Lambda` `Throttles` | `FunctionName=<api>` |
  | `worker-lambda-throttles` | `AWS/Lambda` `Throttles` | `FunctionName=<worker>` |
  | `dynamodb-read-throttle-events` | `AWS/DynamoDB` `ReadThrottleEvents` | `TableName` |
  | `dynamodb-write-throttle-events` | `AWS/DynamoDB` `WriteThrottleEvents` | `TableName` |
  | `generation-failures` | `TokenDesigner` `GenerationFailures` | `Stage` (handled failures) |
  | `generation-count-daily` | `TokenDesigner` `GenerationCount` | `Stage` (Sum > 50/day) |
  | `estimated-ai-cost-daily` | `TokenDesigner` `EstimatedAICost` | `Stage` (Sum > $5/day) |

  The monitoring module takes `api_id`, `api_stage_name`, `api_lambda_name`,
  `worker_lambda_name`, and `table_name` so dimensions always match the
  deployed resources. The AI alarms and `generation-failures` keep the worker's
  EMF namespace/dimension (`packages/shared/src/constants.ts`: `TokenDesigner`
  / `Stage`). `worker-lambda-errors` only sees unhandled crashes; handled
  failures (kill switch, missing key, Stability non-2xx, sharp/S3/DDB) mark the
  job failed and return success, so the worker emits the `GenerationFailures`
  EMF metric instead.
- **Budget** — $25 limit with $1/$5/$10/$25 actual-spend thresholds. The SNS
  topic policy in the monitoring module grants `budgets.amazonaws.com`
  `SNS:Publish` (scoped by `aws:SourceAccount` and the budget ARN) and
  `cloudwatch.amazonaws.com` `SNS:Publish` (scoped by `aws:SourceAccount`),
  preserving the account-owner path. Thresholds are documented in
  `docs/COSTS.md`.
- **CI** — `.github/dependabot.yml` (weekly npm + GitHub Actions), the optional
  OIDC dev plan job (`-lock=false`), and the optional OIDC E2E job described
  above.
- **Scripts** — `scripts/deploy-web.sh [dev|prod]` (or `TF_ENV`) and
  `apps/api/src/scripts/seed-dev.ts` (`TF_ENV`, default `dev`; all `SEED_*`
  resource overrides skip Terraform) are environment-aware.
- **Docs** — `docs/COSTS.md`, `docs/SECURITY.md`, `docs/RUNBOOK.md`, and the
  Phase 6 material in `docs/TESTING.md`/`docs/RAID.md`.
