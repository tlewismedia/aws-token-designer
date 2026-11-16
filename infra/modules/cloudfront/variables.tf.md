# `variables.tf` — CloudFront inputs

**Purpose:** Define what the distribution needs from storage, the API, and the environment.

## Inputs

| Name | Meaning |
|---|---|
| `project`, `stage`, `tags` | Naming/tagging. |
| `web_bucket_id` / `web_bucket_arn` / `web_bucket_regional_domain_name` | S3 origin + OAC policy target. |
| `api_domain_name` | execute-api domain **without** scheme (API origin). |
| `media_bucket_id` | Bucket whose CORS rule is managed here. |
| `media_allowed_origins` | Extra CORS origins (localhost in dev, none in prod); distribution origin is appended. |
| `wait_for_deployment` | Whether `apply` waits for the distribution to deploy (slow but deterministic). |
| `protect_from_deletion` | Prod: add Deny `s3:DeleteBucket` to the web bucket policy. |

## Teaching notes

- **No `api_id` input:** CloudFront needs the domain, not the API id. API Gateway’s execute-api domain is stable for the API.
- **CORS is computed, not passed:** `local.media_allowed_origins` appends `https://<distribution domain>` to the input list. That is why the distribution is created before the CORS rule in the graph.
- **`wait_for_deployment = false`** speeds local iteration but means `apply` can return before the CDN is live. Use true for real deploys.

## Related

- `main.tf`
- `infra/modules/storage`
- `infra/modules/api`
