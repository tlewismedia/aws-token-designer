# Terraform Primer (this stack)

> Phase 1 foundation. Each concept below maps to a concrete file in this repo.

## Provider

The AWS plugin Terraform uses to create resources. Version pinned so every
machine gets the same behavior.

- `infra/envs/dev/versions.tf` — `hashicorp/aws ~> 5.0`, `hashicorp/archive >= 2.0`
- `infra/bootstrap/versions.tf` — same AWS pin for the state bucket
- Each module has its own `versions.tf` restating what it needs
- Region is fixed once: `provider "aws" { region = "us-west-2" }` in
  `infra/envs/dev/main.tf` (bootstrap uses `var.region`, default `us-west-2`)

## Resource

One AWS object managed by Terraform. Examples in this stack:

| AWS object | File |
|---|---|
| Cognito user pool + app client | `infra/modules/cognito/main.tf` (`aws_cognito_user_pool`, `aws_cognito_user_pool_client`) |
| Pre-sign-up auto-confirm Lambda + role + permission | `infra/modules/cognito/main.tf` (`aws_lambda_function`, `aws_iam_role`, `aws_lambda_permission`) |
| DynamoDB single table | `infra/modules/dynamodb/main.tf` (`aws_dynamodb_table`) |
| Web + media buckets, encryption, CORS, lifecycle | `infra/modules/storage/main.tf` (`aws_s3_bucket`, `..._cors_configuration`, `..._lifecycle_configuration`, ...) |
| SNS topic + email subscription | `infra/modules/monitoring/main.tf` (`aws_sns_topic`, `aws_sns_topic_subscription`) |
| Monthly budget, anomaly monitor + subscription | `infra/modules/monitoring/main.tf` (`aws_budgets_budget`, `aws_ce_anomaly_monitor`, `aws_ce_anomaly_subscription`) |
| State bucket (+ versioning, SSE-S3, public-access block) | `infra/bootstrap/main.tf` |

## State

Terraform's record of what it created (a JSON snapshot per environment).
Commands read state to plan the smallest change that reaches the config.

- Separate state per env: `dev` key `dev/terraform.tfstate`
  (prod gets its own env dir + key in Phase 6)
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
- `infra/envs/dev/backend.hcl.example` — copy to `backend.hcl` (gitignored)
  and fill in the real bucket name from the bootstrap output
- Init: `terraform -chdir=infra/envs/dev init -backend-config=backend.hcl`

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
  controls, public-access-blocked, SSE-S3); media CORS allows presigned PUT
  from `var.media_allowed_origins` (localhost now, CloudFront domain in
  Phase 5); both buckets abort incomplete multipart uploads after 1 day
- `infra/modules/monitoring/` — SNS topic + email subscription
  (`var.alert_email`, placeholder `alerts@example.com`), monthly budget with
  $1/$5/$10/$25 thresholds, Cost Anomaly Detection monitor + low-threshold
  ($5 impact) subscription
- Wiring: `infra/envs/dev/main.tf` calls all four modules with shared tags

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

CI runs `terraform fmt -check` + `validate` + `plan` on dev (see
docs/PLAN.md section 9). Manual `apply` first; GitHub Actions OIDC later.

## prevent_destroy

A guard flag that makes `terraform destroy` refuse to delete a resource.
Dev resources are destroyable (no flag), so `destroy` works for cleanup.
Prod (Phase 6) will set `prevent_destroy = true` on stateful resources
(table, buckets) — see docs/ARCHITECTURE.md section 7.2.

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

## Tags

Every resource carries `Project=token-designer`, `Stage=<env>`,
`ManagedBy=terraform` via `default_tags` in `infra/envs/dev/main.tf` plus
`local.tags` passed into each module.

## Deferred to later phases

- `infra/envs/prod/` — Phase 6
- Lambda / API Gateway / CloudFront resources — Phases 2 and 5
  (the web bucket's OAC policy waits for the distribution:
  `TODO` + `var.cloudfront_distribution_arn` in `infra/modules/storage/`)
- CloudWatch alarms beyond budgets/anomaly — Phase 6 with the Lambdas
