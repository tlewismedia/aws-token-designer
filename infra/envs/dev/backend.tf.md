# `backend.tf` — Dev remote state backend

**Purpose:** Tell Terraform that dev state lives in S3, without putting the bucket name in the repo.

## What it declares

```hcl
terraform {
  backend "s3" {}
}
```

An **empty** S3 backend block. The real values come from `backend.hcl` at init time:

```bash
terraform -chdir=infra/envs/dev init -backend-config=backend.hcl
```

`backend.hcl` is gitignored; `backend.hcl.example` is the template.

## Teaching notes

- Backend blocks are evaluated before variables exist, so they **cannot** use `var.*` or module outputs. That is why the config is a separate file.
- `backend.hcl` typically contains: `bucket`, `key` (`dev/terraform.tfstate`), `region`, `encrypt = true`, `use_lockfile = true`.
- The lockfile prevents two applies from writing state concurrently. Without it, parallel applies can corrupt state.
- Never commit `backend.hcl` or `*.tfstate`. The state bucket is private and versioned.

## Related

- `infra/bootstrap/` — creates the bucket
- `docs/TERRAFORM.md` — “Backend” and “Bootstrap”
