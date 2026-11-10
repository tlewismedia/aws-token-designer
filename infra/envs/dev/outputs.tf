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
