# `variables.tf` — Dev inputs

**Purpose:** Define the dev environment’s tunable values and safe defaults.

## Variables

| Name | Default | Why |
|---|---|---|
| `project` | `token-designer` | Prefix for resource names and tags. |
| `stage` | `dev` | Drives names, SSM paths, and tags. |
| `region` | `us-west-2` | Single region for all resources. |
| `alert_email` | `alerts@example.com` | Placeholder. Pass the real address via `-var` or gitignored tfvars. |
| `media_allowed_origins` | `["http://localhost:5173"]` | Extra CORS origins for presigned uploads. CloudFront origin is appended by the cloudfront module. |
| `stripe_price_id` | test price ID | Non-secret config. Empty disables checkout. |
| `web_origin` | dev CloudFront URL | Stripe Checkout return URL. |
| `credits_per_purchase` | `10` | Server-controlled credit grant. |

## Teaching notes

- **Placeholder email:** avoids putting a personal address in a public repo. Override at apply time.
- **Non-secret config in variables is fine:** publishing a Stripe *price* ID is harmless; the *secret* key is not here.
- **`web_origin` is an input, not a module reference:** referencing the CloudFront domain here would create a dependency cycle (see `main.tf.md`).
- **Change defaults carefully:** `stage` feeds resource names and SSM paths. Changing it after apply creates a parallel stack, not a rename.

## Related

- `main.tf` — where each variable is consumed
- `docs/TERRAFORM.md` — “Variables”
