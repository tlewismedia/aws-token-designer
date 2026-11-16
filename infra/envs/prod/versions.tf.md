# `versions.tf` — Prod provider constraints

**Purpose:** Pin Terraform and providers for production.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`
- `hashicorp/archive >= 2.0`

## Teaching notes

- **Prod should not float on `latest`.** The pessimistic constraint allows patch/minor updates, but 6.x requires a deliberate migration.
- The lockfile is the real reproducibility guarantee; commit it and review lockfile diffs in PRs.
- Before upgrading in prod, apply the same change in dev and read the plan. Provider upgrades can change defaults for resources you did not touch.

## Related

- `docs/TERRAFORM.md`
- `.terraform.lock.hcl`
