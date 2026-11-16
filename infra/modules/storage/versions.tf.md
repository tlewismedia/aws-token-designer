# `versions.tf` — Storage module provider constraints

**Purpose:** Declare the module’s Terraform/provider requirements.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`

## Teaching notes

- S3 resources are all in the AWS provider.
- The module has no archive/provider needs; it creates no zips.
- Keep constraints aligned with the root.

## Related

- `main.tf`
