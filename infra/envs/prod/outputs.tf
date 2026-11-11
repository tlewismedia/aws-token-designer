output "user_pool_id" {
  description = "Cognito user pool ID (VITE_COGNITO_USER_POOL_ID)."
  value       = module.cognito.user_pool_id
}

output "client_id" {
  description = "Cognito app client ID (VITE_COGNITO_CLIENT_ID)."
  value       = module.cognito.client_id
}

output "table_name" {
  description = "DynamoDB single-table name."
  value       = module.dynamodb.table_name
}

output "web_bucket_name" {
  description = "S3 bucket hosting the built SPA."
  value       = module.storage.web_bucket_name
}

output "media_bucket_name" {
  description = "Private S3 bucket for full + thumbnail images."
  value       = module.storage.media_bucket_name
}

output "alerts_topic_arn" {
  description = "SNS topic ARN for alarm and budget notifications."
  value       = module.monitoring.alerts_topic_arn
}

output "ssm_parameter_names" {
  description = "SSM parameter NAMES (values are created out-of-band, never in state)."
  value       = local.ssm_parameter_names
}

output "api_url" {
  description = "execute-api URL (stage api). Set as VITE proxy target for local dev."
  value       = module.api.api_url
}

output "web_url" {
  description = "Public CloudFront URL for the SPA (same-origin /api/* proxy)."
  value       = "https://${module.cloudfront.distribution_domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (deploy-web invalidation target)."
  value       = module.cloudfront.distribution_id
}

output "cloudfront_domain_name" {
  description = "Default CloudFront domain name (no scheme)."
  value       = module.cloudfront.distribution_domain_name
}

output "aws_region" {
  description = "AWS region of the deployment (VITE_AWS_REGION for scripts/deploy-web.sh)."
  value       = var.region
}

output "api_lambda_name" {
  description = "Name of the api Lambda function."
  value       = module.lambda.lambda_name
}

output "sharp_layer_arn" {
  description = "ARN of the sharp Lambda layer."
  value       = module.lambda.sharp_layer_arn
}

output "generation_worker_name" {
  description = "Name of the generateWorker Lambda function."
  value       = module.lambda.worker_lambda_name
}

output "generation_worker_role_arn" {
  description = "Execution role ARN of the generateWorker Lambda."
  value       = module.lambda.worker_role_arn
}
