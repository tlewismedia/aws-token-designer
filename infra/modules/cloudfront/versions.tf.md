# `versions.tf` — CloudFront module provider constraints

**Purpose:** Declare the module’s Terraform/provider requirements.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`

## Teaching notes

- CloudFront resources are all in the AWS provider; no extra provider is needed.
- The module does not manage ACM/Route 53 in v1, so no us-east-1 provider alias is required. That changes only when a custom domain is added.
- Keep constraints aligned with the root; the root decides the final selected version.

## Related

- `docs/TERRAFORM.md`
