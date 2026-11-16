# `outputs.tf` — Prod outputs

**Purpose:** The same contract as dev, for the production stack.

## Outputs

- Frontend: `user_pool_id`, `client_id`, `aws_region`, `api_url`
- Deployment: `web_bucket_name`, `cloudfront_distribution_id`, `web_url`, `cloudfront_domain_name`
- Infrastructure: `table_name`, `media_bucket_name`, `alerts_topic_arn`, `api_id`, `api_lambda_name`, `sharp_layer_arn`, `generation_worker_name`, `generation_worker_role_arn`
- Config names: `ssm_parameter_names`

## Teaching notes

- Outputs are how CI/deploy scripts discover prod resources without hardcoding names.
- `web_url` is used to set `web_origin` for Stripe after the first apply.
- Outputs are not a secrets channel. If a value is sensitive, store it in SSM and output only the parameter **name**.

## Related

- `scripts/deploy-web.sh`
- `apps/web/.env.production` (or the deploy environment)
- `docs/TERRAFORM.md`
