# `variables.tf` — HTTP API inputs and outputs

**Purpose:** Define the API module’s inputs — and, unusually, its outputs at the bottom of the same file.

## Inputs

| Name | Meaning |
|---|---|
| `project`, `stage`, `tags` | Naming and tagging. |
| `cognito_user_pool_id` | JWT issuer pool. |
| `cognito_client_id` | JWT audience. |
| `lambda_invoke_arn` | Integration target. |
| `lambda_name` | Used for the invoke permission. |
| `log_retention_days` | Access-log retention; validated against CloudWatch’s allowed values (7 dev, 30 prod). |

## Outputs (also in this file)

| Output | Consumer |
|---|---|
| `api_endpoint` | Base endpoint. |
| `api_domain_name` | CloudFront origin (no scheme). |
| `api_url` | Vite dev proxy target. |
| `api_id` | Alarm dimensions, debugging. |
| `stage_name` | CloudWatch `Stage` dimension (literally `api`). |
| `execution_arn` | Permission/debugging. |

## Teaching notes

- Terraform does not require `outputs.tf` to be a separate file; outputs can live anywhere. This module keeps them here, which is legal but slightly unconventional — most readers expect `outputs.tf`.
- The `log_retention_days` validation is an allowlist. CloudWatch only accepts specific retention values; catching a bad value at plan time is better than an API error at apply.
- **Do not output secrets.** These outputs are IDs/URLs only.

## Related

- `main.tf`
- `docs/TERRAFORM.md`
