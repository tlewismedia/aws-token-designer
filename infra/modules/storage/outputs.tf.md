# `outputs.tf` — Storage outputs

**Purpose:** Expose bucket identity/domain to CloudFront, Lambda, and deploy scripts.

## Outputs

| Output | Consumer |
|---|---|
| `web_bucket_name` / `web_bucket_id` | S3 sync target; OAC policy bucket. |
| `web_bucket_arn` | OAC policy target; deletion-protection statement. |
| `web_bucket_regional_domain_name` | CloudFront S3 origin. |
| `media_bucket_name` / `media_bucket_id` | Lambda env; CloudFront CORS rule. |
| `media_bucket_arn` | Lambda IAM policy; deletion-protection policy. |

## Teaching notes

- **Name vs ID:** they are the same for S3, but both are exposed because different resources accept different attributes.
- **Regional domain:** CloudFront’s S3 origin expects the bucket’s regional endpoint, not the global one.
- **Keep outputs minimal:** every output is part of the module contract.

## Related

- `infra/modules/cloudfront`
- `infra/modules/lambda`
- `scripts/deploy-web.sh`
