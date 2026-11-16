# `outputs.tf` — CloudFront outputs

**Purpose:** Expose the distribution identity and domain.

## Outputs

| Output | Consumer |
|---|---|
| `distribution_id` | `scripts/deploy-web.sh` invalidation target. |
| `distribution_domain_name` | Public URL (`https://<domain>`), and the media CORS origin. |
| `distribution_arn` | OAC policy condition. |
| `distribution_hosted_zone_id` | Route 53 alias target when a custom domain is added. |

## Teaching notes

- CloudFront’s default domain is stable for the life of the distribution; if you recreate the distribution, the domain changes.
- Keep `distribution_id` out of hardcoded scripts — read it from Terraform output.
- The hosted zone ID is only needed for alias records; no custom domain in v1.

## Related

- `infra/envs/*/outputs.tf` (`web_url`, `cloudfront_distribution_id`)
- `scripts/deploy-web.sh`
