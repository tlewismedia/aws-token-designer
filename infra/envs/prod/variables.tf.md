# `variables.tf` — Prod inputs

**Purpose:** Prod defaults, deliberately stricter than dev.

## Variables

| Name | Prod default | Why |
|---|---|---|
| `project` | `token-designer` | Name prefix. |
| `stage` | `prod` | Resource names, SSM paths, tags. |
| `region` | `us-west-2` | Single region. |
| `alert_email` | placeholder | Real address passed via `-var`/tfvars. |
| `media_allowed_origins` | `[]` | Only the CloudFront origin may upload; no localhost. |
| `stripe_price_id` | test price ID | Non-secret; replace for live mode later. |
| `web_origin` | prod CloudFront URL | Stripe return URL. |
| `credits_per_purchase` | `10` | Server-controlled grant. |

## Teaching notes

- **Prod defaults should be safe:** no localhost origins, no debug settings, no wildcard access.
- **Placeholder email** keeps personal data out of the public repo.
- **Stage drives names:** changing `stage` after apply creates a parallel environment, not a rename.
- **Secret values are not variables here.** Stripe/Stability secrets live in SSM SecureString.

## Related

- `main.tf`
- `docs/TERRAFORM.md`
