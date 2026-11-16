# `outputs.tf` — Dev outputs

**Purpose:** Publish the values the frontend, deploy scripts, and operators need.

## Groups

**Frontend configuration (public):**
- `user_pool_id` → `VITE_COGNITO_USER_POOL_ID`
- `client_id` → `VITE_COGNITO_CLIENT_ID`
- `aws_region` → `VITE_AWS_REGION`
- `api_url` → Vite dev proxy target

**Deployment targets:**
- `web_bucket_name` → S3 sync target
- `cloudfront_distribution_id` → invalidation target
- `web_url` / `cloudfront_domain_name` → public URL

**Infrastructure/debugging:**
- `table_name`, `media_bucket_name`, `alerts_topic_arn`
- `api_id`, `api_lambda_name`, `sharp_layer_arn`
- `generation_worker_name`, `generation_worker_role_arn`
- `ssm_parameter_names` (names only, not values)

## Teaching notes

- Outputs are the contract between infrastructure and everything else. If a script needs a value, expose it here rather than hardcoding it.
- Outputs are not secrets by default — anyone with state access and `terraform output` can read them. Never output secret **values**.
- `terraform output -raw web_url` is used by operators when setting `web_origin` for Stripe.

## Related

- `scripts/deploy-web.sh`
- `apps/web/.env.local`
- `docs/TERRAFORM.md`
