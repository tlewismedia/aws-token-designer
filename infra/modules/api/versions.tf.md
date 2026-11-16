# `versions.tf` — HTTP API module provider constraints

**Purpose:** Declare the module’s Terraform/provider requirements.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`

## Teaching notes

- Modules should declare their own constraints so they can be reused. The root environment’s `versions.tf` still controls the final selected version.
- This module does not need `archive` — it creates no zip files.
- Keep module constraints as loose as the module can tolerate; pin tightly in the root.

## Related

- `docs/TERRAFORM.md`
