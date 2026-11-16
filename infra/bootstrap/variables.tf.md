# `variables.tf` — Bootstrap inputs

**Purpose:** Define the two inputs the bootstrap root needs.

## Variables

| Name | Type | Default | Meaning |
|---|---|---|---|
| `region` | `string` | `us-west-2` | Region for the state bucket. Keep it stable; moving state buckets across regions is a migration. |
| `state_bucket_name` | `string` | none (required) | Globally unique S3 bucket name. Passed on the CLI so the real name is not committed. |

## Teaching notes

- No `default` on `state_bucket_name` is deliberate: Terraform fails fast if you forget it, instead of creating a bucket with a placeholder name.
- A variable without a default is the Terraform equivalent of a required argument.
- Keep environment-specific values out of `.tf` files when they are sensitive or account-specific.

## Example

```bash
terraform -chdir=infra/bootstrap apply \
  -var="state_bucket_name=token-designer-tfstate-<account-id>"
```
