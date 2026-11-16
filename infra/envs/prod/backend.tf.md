# `backend.tf` — Prod remote state backend

**Purpose:** Same pattern as dev: empty S3 backend block, real values from a gitignored `backend.hcl`.

```bash
terraform -chdir=infra/envs/prod init -backend-config=backend.hcl
```

## Teaching notes

- The prod state **must** be separate from dev. A mistake in one environment should never be able to touch the other’s state.
- `backend.hcl` key is typically `prod/terraform.tfstate`.
- The state bucket is created once by `infra/bootstrap` and shared by both environments; the **key** isolates them.
- Never run `terraform apply` in prod with a backend pointed at dev. Verify with `terraform state list` and the bucket/key before applying.

## Related

- `infra/bootstrap/`
- `docs/TERRAFORM.md`
