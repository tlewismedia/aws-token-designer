# `variables.tf` — Storage inputs

**Purpose:** Naming, tags, and the production deletion guard.

## Inputs

| Name | Default | Meaning |
|---|---|---|
| `project` | `token-designer` | Name prefix. |
| `stage` | required | Environment (`dev`/`prod`). |
| `tags` | `{}` | Extra tags. |
| `prevent_destroy` | `false` | Prod: add Deny `s3:DeleteBucket` to the media bucket policy. |

## Teaching notes

- **S3 has no native deletion-protection flag**, and Terraform `lifecycle.prevent_destroy` only accepts literals. The module uses a bucket policy Deny as the guard.
- **The web bucket is protected in the cloudfront module**, because S3 allows one bucket policy per bucket and CloudFront already owns the web policy.
- **Dev is intentionally destroyable** so the stack can be torn down cheaply.
- **No CORS input here:** the media CORS rule moved to cloudfront, which knows the distribution domain.

## Related

- `main.tf`
- `infra/modules/cloudfront`
- `docs/PLAN.md` §7.1
