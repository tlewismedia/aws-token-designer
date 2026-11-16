# `versions.tf` — Monitoring module provider constraints

**Purpose:** Declare the module’s Terraform/provider requirements.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`

## Teaching notes

- SNS, Budgets, and CloudWatch are all in the AWS provider.
- Budgets notifications publish to SNS; the topic policy in `main.tf` is what makes that work.
- Keep constraints aligned with the root.

## Related

- `main.tf`
