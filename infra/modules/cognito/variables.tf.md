# `variables.tf` — Cognito inputs

**Purpose:** Define naming and the two production guardrails.

## Inputs

| Name | Default | Meaning |
|---|---|---|
| `project` | `token-designer` | Name prefix. |
| `stage` | required | Environment name (`dev`/`prod`). |
| `tags` | `{}` | Extra tags. |
| `prevent_destroy` | `false` | Prod: enable Cognito deletion protection. |
| `log_retention_days` | `7` | Trigger Lambda log retention; validated allowlist, prod 30. |

## Teaching notes

- **`prevent_destroy` is translated, not applied literally:** the module uses it to set `deletion_protection = ACTIVE/INACTIVE` on the pool. Terraform `lifecycle` only accepts literals, so a variable cannot drive it directly.
- **Retention validation:** CloudWatch accepts only specific values; the `validation` block fails at plan time instead of at apply.
- **No secret inputs:** this module needs no keys.

## Related

- `main.tf`
- `docs/PLAN.md` §7.1/§7.6
