# `main.tf` — Dev environment wiring

**Purpose:** Compose the dev environment from modules and connect their outputs. This is the file you read to understand what dev actually contains.

## Structure

1. **Provider** — `region = var.region` plus `default_tags`.
2. **Locals** — shared tags and the SSM parameter **names** (never values).
3. **`moved` block** — moves the media bucket CORS rule from `storage` to `cloudfront` without destroying/recreating it.
4. **Modules**, in dependency order:
   - `cognito` — user pool, client, pre-sign-up trigger
   - `dynamodb` — single table
   - `storage` — web + media buckets
   - `monitoring` — SNS, budget, alarms (needs API/Lambda/table names)
   - `lambda` — `api` + `generateWorker`, sharp layer
   - `api` — HTTP API + JWT authorizer
   - `cloudfront` — same-origin SPA + `/api/*` proxy

## Teaching notes

- **SSM names only:** the `ssm_parameter_names` local holds paths like `/token-designer/dev/stripe/secret`. The secret values are created out-of-band with `aws ssm put-parameter` and never enter Terraform state.
- **`moved` block:** Terraform uses it to update state addresses without recreating resources. It is how you refactor module boundaries safely.
- **Dependency direction:** monitoring needs `api`, `lambda`, and `dynamodb` outputs; cloudfront needs `api` and `storage`; API needs `lambda`. Terraform infers this graph from references.
- **`reserved_concurrency = -1`:** this account’s Lambda concurrency limit is too low to reserve. The comment explains the deviation.
- **`web_origin` cycle:** the CloudFront domain is not referenced here because `cloudfront -> api -> lambda -> web_origin` would create a cycle. An operator can set it after the first apply for Stripe.

## Safe changes

- Adding a module: add the block, pass required inputs, then `terraform plan`.
- Moving resources between modules: use `moved` blocks, never delete/recreate if data matters.
- Changing names/tags is usually in-place; changing bucket/table names is destructive.
