# `main.tf` — Prod environment wiring

**Purpose:** Compose production from the same modules as dev, with production guardrails.

## Differences from dev

| Concern | Dev | Prod |
|---|---|---|
| Stateful resources | destroyable | `prevent_destroy = true` on Cognito, DynamoDB, S3 |
| Log retention | 7 days | 30 days |
| S3 deletion protection | off | bucket policies deny `s3:DeleteBucket` |
| `terraform_data.deletion_guard` | absent | `prevent_destroy = true` blocks `terraform destroy` |
| Extra CORS origins | localhost | none (only the CloudFront origin) |
| Stage / names | `dev` | `prod` |

## Common structure

- Provider + `default_tags`
- `locals` for tags and SSM parameter **names**
- `moved` block for the media CORS rule (mirrors dev so an imported old state plans cleanly)
- Modules: `cognito`, `dynamodb`, `storage`, `monitoring`, `lambda`, `api`, `cloudfront`

## Teaching notes

- **Same modules, different wiring** is the point of modules. Prod is not a fork of the code; it is the same code with stricter inputs.
- `prevent_destroy` is a Terraform lifecycle setting and must be a literal. That is why modules accept a `prevent_destroy` variable and translate it into native settings (Cognito deletion protection, DynamoDB deletion protection) or bucket policies.
- `terraform_data.deletion_guard` is an inert resource whose only job is to carry `prevent_destroy = true`, because S3 has no native deletion-protection flag.
- The `web_origin` cycle note is identical to dev: the CloudFront domain is set by an operator after the first apply when Stripe needs it.

## Safe changes

- **Never** remove a `prevent_destroy` guard casually. Removing it makes the next `destroy` possible.
- Treat prod applies as reviewed changes: `terraform plan` first, then apply.
- Do not add dev-only origins or debug settings here.
