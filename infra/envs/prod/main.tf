provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "token-designer"
      Stage     = var.stage
      ManagedBy = "terraform"
    }
  }
}

locals {
  tags = {
    Project   = "token-designer"
    Stage     = var.stage
    ManagedBy = "terraform"
  }

  # SSM parameter NAMES only. Values are created out-of-band (never in
  # Terraform state) — see docs/TERRAFORM.md "SSM secrets".
  ssm_parameter_names = {
    stripe_secret         = "/token-designer/${var.stage}/stripe/secret"
    stripe_webhook_secret = "/token-designer/${var.stage}/stripe/webhook-secret"
    stability_api_key     = "/token-designer/${var.stage}/stability/api-key"
    generation_enabled    = "/token-designer/${var.stage}/generation-enabled"
  }
}

# The media-bucket CORS rule moved from the storage module to cloudfront in
# Phase 5. Prod state is fresh, so this is a no-op, but keeping it mirrors dev
# and makes a state imported from a pre-Phase-5 build plan cleanly.
moved {
  from = module.storage.aws_s3_bucket_cors_configuration.media
  to   = module.cloudfront.aws_s3_bucket_cors_configuration.media
}

module "cognito" {
  source = "../../modules/cognito"

  project = var.project
  stage   = var.stage
  tags    = local.tags

  # Stateful: prod refuses to destroy the user pool (PLAN 7.1).
  prevent_destroy = true

  # PLAN 7.6: 30-day pre-sign-up log retention in prod.
  log_retention_days = 30
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  project = var.project
  stage   = var.stage
  tags    = local.tags

  # Stateful: prod refuses to destroy the single table (PLAN 7.1).
  prevent_destroy = true
}

module "storage" {
  source = "../../modules/storage"

  project = var.project
  stage   = var.stage
  tags    = local.tags

  # Stateful: prod refuses to destroy the web and media buckets (PLAN 7.1).
  prevent_destroy = true
}

module "monitoring" {
  source = "../../modules/monitoring"

  project     = var.project
  stage       = var.stage
  alert_email = var.alert_email
  tags        = local.tags

  # Phase 6 platform alarms (API 5xx, Lambda errors/throttles, DynamoDB
  # throttles, handled generation failures). Dimensions come from the deployed
  # resources, not hardcoded; the API Gateway stage is literally "api".
  api_id             = module.api.api_id
  api_stage_name     = module.api.stage_name
  api_lambda_name    = module.lambda.lambda_name
  worker_lambda_name = module.lambda.worker_lambda_name
  table_name         = module.dynamodb.table_name
}

# Phase 2: api Lambda + HTTP API. The sharp layer and bundle must exist
# before apply: ./scripts/build-lambda.sh && ./scripts/build-sharp-layer.sh
module "lambda" {
  source = "../../modules/lambda"

  project = var.project
  stage   = var.stage
  tags    = local.tags

  source_dist     = "${path.root}/../../../apps/api/dist"
  sharp_layer_dir = "${path.root}/../../../apps/api/dist/sharp-layer"

  # The account-level Lambda concurrency limit is 10 (UnreservedConcurrent
  # Executions minimum is also 10), so no reservation fits in this account.
  # Keep -1 until the quota is raised (PLAN 7.6 deviation).
  reserved_concurrency = -1

  # PLAN 7.6: 30-day log retention in prod (dev keeps the module default 7).
  log_retention_days = 30

  table_name        = module.dynamodb.table_name
  table_arn         = module.dynamodb.table_arn
  media_bucket_name = module.storage.media_bucket_name
  media_bucket_arn  = module.storage.media_bucket_arn

  # Parameter NAMES only; values are created out-of-band (docs/TERRAFORM.md).
  stability_param_name   = local.ssm_parameter_names.stability_api_key
  kill_switch_param_name = local.ssm_parameter_names.generation_enabled

  # Stripe payments (Phase 4). The price id is non-secret config; the two
  # secret values live in SSM SecureString and are read at request time.
  stripe_price_id                  = var.stripe_price_id
  stripe_secret_param_name         = local.ssm_parameter_names.stripe_secret
  stripe_webhook_secret_param_name = local.ssm_parameter_names.stripe_webhook_secret
  web_origin                       = var.web_origin
  credits_per_purchase             = var.credits_per_purchase
}

module "api" {
  source = "../../modules/api"

  project = var.project
  stage   = var.stage
  tags    = local.tags

  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.client_id

  lambda_invoke_arn = module.lambda.lambda_invoke_arn
  lambda_name       = module.lambda.lambda_name

  # PLAN 7.6: 30-day API Gateway access-log retention in prod.
  log_retention_days = 30
}

# Phase 5: one CloudFront default URL serves the SPA from the web bucket (OAC)
# and proxies /api/* to the HTTP API, so the browser sees a single origin
# (ADR-0003). No custom domain/ACM/Route 53 in v1.
#
# WEB_ORIGIN intentionally stays an env input (default "") rather than
# referencing the distribution: doing so would create a Terraform cycle
# (distribution -> api origin; lambda -> distribution). After the first apply
# an operator can set it for Stripe with
#   terraform -chdir=infra/envs/prod apply \
#     -var="web_origin=$(terraform -chdir=infra/envs/prod output -raw web_url)"
module "cloudfront" {
  source = "../../modules/cloudfront"

  project = var.project
  stage   = var.stage
  tags    = local.tags

  web_bucket_id                   = module.storage.web_bucket_id
  web_bucket_arn                  = module.storage.web_bucket_arn
  web_bucket_regional_domain_name = module.storage.web_bucket_regional_domain_name

  media_bucket_id       = module.storage.media_bucket_id
  media_allowed_origins = var.media_allowed_origins

  api_domain_name = module.api.api_domain_name

  # Prod-only S3 delete protection for the web bucket (the media bucket gets
  # the matching statement in the storage module). Dev leaves this false.
  protect_from_deletion = true
}

# Terraform-level production guard. S3 has no native deletion protection and
# `lifecycle.prevent_destroy` cannot be set from a variable, so this inert
# resource carries the flag: `terraform destroy` fails here until the guard is
# deliberately removed. The bucket-policy Deny statements in the storage and
# cloudfront modules are defense-in-depth for out-of-band/IAM deletes.
resource "terraform_data" "deletion_guard" {
  lifecycle {
    prevent_destroy = true
  }
}
