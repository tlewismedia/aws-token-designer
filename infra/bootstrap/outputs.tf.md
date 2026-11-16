# `outputs.tf` — Bootstrap outputs

**Purpose:** Expose the state bucket identity so the environment backends can be configured without hardcoding it.

## Outputs

| Output | Consumer |
|---|---|
| `state_bucket_name` | Copy into `infra/envs/<env>/backend.hcl` (gitignored) as `bucket = "..."`. |
| `state_bucket_arn` | Useful for auditing or an IAM policy that grants access to state. |

## Teaching notes

- Outputs are how a Terraform root hands values to humans or other tooling. They are not secrets here, but the bucket name is still kept out of the repo by convention.
- Terraform backend blocks **cannot** reference outputs or variables. That is why bootstrap is a separate apply and the value is copied into `backend.hcl` manually (or by a script).
- After applying, read them with:

```bash
terraform -chdir=infra/bootstrap output state_bucket_name
```

## Related

- `backend.tf` in each env
- `infra/envs/*/backend.hcl.example`
- `docs/TERRAFORM.md`
