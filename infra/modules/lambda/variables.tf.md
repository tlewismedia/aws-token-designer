# `variables.tf` — Lambda module inputs and outputs

**Purpose:** Define everything the two functions need, plus the outputs other modules consume.

## Inputs (grouped)

**Naming/tags:** `project`, `stage`, `tags`.

**Build artifacts:**
- `source_dist` — `apps/api/dist` (must contain `index.mjs` and `generation.mjs`).
- `sharp_layer_dir` — `apps/api/dist/sharp-layer` (must contain `nodejs/node_modules/sharp`).

**Runtime:**
- `reserved_concurrency` (-1 = unreserved), `log_retention_days` (validated allowlist).

**Data access:**
- `table_name`/`table_arn`, `media_bucket_name`/`media_bucket_arn`.

**Secrets/config (names only):**
- `stability_param_name`, `kill_switch_param_name`
- `stripe_secret_param_name`, `stripe_webhook_secret_param_name`
- `stripe_price_id`, `web_origin`, `credits_per_purchase`

## Outputs (bottom of this file)

`lambda_arn`, `lambda_name`, `lambda_invoke_arn`, `sharp_layer_arn`, `role_arn`, `worker_lambda_arn`, `worker_lambda_name`, `worker_role_arn`.

## Teaching notes

- **Artifacts must exist before plan/apply.** `archive_file` reads the files at plan time; a missing bundle fails the plan. Run the build scripts first.
- **Credits validation:** `credits_per_purchase` must be a positive integer; catching it at plan time avoids nonsensical grants.
- **No secret values:** parameters are names. Terraform state should never contain the Stripe/Stability keys.
- **Outputs in `variables.tf`:** legal but unconventional; most readers look for `outputs.tf`.

## Related

- `main.tf`
- `docs/TERRAFORM.md` — “SSM secrets”
