# `versions.tf` — Bootstrap provider constraints

**Purpose:** Pin the Terraform and AWS provider versions for the bootstrap root.

## What it declares

- `required_version >= 1.10` — needed for native S3 state locking (`use_lockfile = true`). Older Terraform can use a DynamoDB lock table instead, but this repo standardised on the newer lockfile.
- `hashicorp/aws ~> 5.0` — allow 5.x patch/minor updates, not 6.x. Avoids surprise breaking changes.

## Teaching notes

- **`~>` is a pessimistic constraint:** `~> 5.0` means `>= 5.0, < 6.0`. It is not the same as `>= 5.0`.
- Provider versions are recorded in `.terraform.lock.hcl` after `terraform init`. Commit the lockfile; it is generated but is your reproducibility record.
- If you upgrade the provider, run `terraform init -upgrade`, then `terraform plan` and read the diff before applying.

## Related

- `docs/TERRAFORM.md` — “Provider” and “Version pinning”
