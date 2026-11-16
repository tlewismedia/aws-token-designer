# `variables.tf` — DynamoDB inputs

**Purpose:** Naming, tags, and the production deletion guard.

## Inputs

| Name | Default | Meaning |
|---|---|---|
| `project` | `token-designer` | Name prefix. |
| `stage` | required | Environment (`dev`/`prod`). |
| `tags` | `{}` | Extra tags. |
| `prevent_destroy` | `false` | Prod: enable native table deletion protection. |

## Teaching notes

- **`prevent_destroy` is a variable because native settings are conditional.** Terraform’s `lifecycle.prevent_destroy` cannot use variables, so the module maps the boolean to `deletion_protection_enabled`.
- **No capacity inputs:** on-demand billing needs none.
- **No table-name input:** the name is derived from `project-stage`, which prevents drift between environments.

## Related

- `main.tf`
- `docs/PLAN.md` §7.1
