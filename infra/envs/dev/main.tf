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

module "cognito" {
  source = "../../modules/cognito"

  project = var.project
  stage   = var.stage
  tags    = local.tags
}

module "dynamodb" {
  source = "../../modules/dynamodb"

  project = var.project
  stage   = var.stage
  tags    = local.tags
}

module "storage" {
  source = "../../modules/storage"

  project               = var.project
  stage                 = var.stage
  tags                  = local.tags
  media_allowed_origins = var.media_allowed_origins
  # cloudfront_distribution_arn stays "" until Phase 5 (see module TODO).
}

module "monitoring" {
  source = "../../modules/monitoring"

  project     = var.project
  stage       = var.stage
  alert_email = var.alert_email
  tags        = local.tags
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
  # Executions minimum is also 10), so no reservation fits. Prod should set
  # 10 once the quota allows (PLAN 7.6).
  reserved_concurrency = -1

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
}
