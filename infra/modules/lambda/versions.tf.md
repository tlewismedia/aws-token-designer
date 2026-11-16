# `versions.tf` — Lambda module provider constraints

**Purpose:** Declare the module’s Terraform/provider requirements.

## What it declares

- `required_version >= 1.10`
- `hashicorp/aws ~> 5.0`
- `hashicorp/archive >= 2.0` — used for the two bundles and the sharp layer.

## Teaching notes

- `archive_file` is a data source; it creates zips during plan/apply. It is not a runtime dependency.
- The layer’s contents come from Docker, not from this provider. Terraform only zips the directory.
- Keep constraints aligned with the root.

## Related

- `main.tf`
- `scripts/build-lambda.sh`
- `scripts/build-sharp-layer.sh`
