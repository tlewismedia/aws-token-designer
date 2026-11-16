# `versions.tf` — DynamoDB module provider constraints

**Purpose:** Declare the module’s Terraform/provider requirements.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`

## Teaching notes

- DynamoDB needs no extra provider.
- Keep the constraint aligned with the root. The root’s selected version is what actually runs.
- Lockfile diffs are the signal that a provider upgrade changed something; review them.

## Related

- `docs/TERRAFORM.md`
