# `main.tf` — Bootstrap: Terraform state bucket

**Purpose:** Create the S3 bucket that stores Terraform state for every environment. This is applied **before** `infra/envs/dev` or `infra/envs/prod`, because those environments reference this bucket in their `backend "s3"` block.

## What it creates

| Resource | Why |
|---|---|
| `aws_s3_bucket.state` | The state bucket. Name is passed in (`var.state_bucket_name`) so the real name stays out of the repo. |
| `aws_s3_bucket_versioning.state` | Keeps previous state versions, so a corrupted or bad apply can be recovered. |
| `aws_s3_bucket_server_side_encryption_configuration.state` | SSE-S3 (AES256) at rest. No KMS cost. |
| `aws_s3_bucket_public_access_block.state` | Blocks all public access. State can contain sensitive values. |

The `provider "aws"` block sets `default_tags` (`Project`, `Stage=bootstrap`, `ManagedBy`) so the bucket is easy to find in cost reports.

## Teaching notes

- **Why a separate root?** Terraform cannot create the bucket that stores its own state in the same configuration that uses it. Bootstrap breaks the chicken-and-egg problem.
- **Why the bucket name is a variable:** S3 bucket names are globally unique and often include the account ID. Passing it on the command line keeps it out of a public repo.
- **Versioning is not optional in practice:** it is the difference between “recover the last good state” and “recreate everything”.
- **No `prevent_destroy` here:** bootstrap is a one-time root. Deleting the bucket is a deliberate disaster-recovery action, not routine cleanup.

## How to apply

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply -var="state_bucket_name=<globally-unique-name>"
```

The outputs feed `infra/envs/<env>/backend.hcl` (see `outputs.tf.md`).

## Safe changes

- Changing tags or encryption settings is in-place.
- **Renaming the bucket** means creating a new bucket and migrating state; treat it as a migration, not a tweak.
- Do not add application resources here — this root must stay tiny and stable.
