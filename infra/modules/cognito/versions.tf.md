# `versions.tf` — Cognito module provider constraints

**Purpose:** Declare the module’s Terraform/provider requirements.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`
- `hashicorp/archive >= 2.0` — because the module zips the pre-sign-up handler.

## Teaching notes

- `archive` is a provider that creates the zip at plan/apply time; it is not the system `zip` command.
- The inline handler is tiny, so there is no separate build step or Lambda layer.
- Keep the archive provider constraint aligned with the root environment.

## Related

- `main.tf` (`data.archive_file.presignup`)
