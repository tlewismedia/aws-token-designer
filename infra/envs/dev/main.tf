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
