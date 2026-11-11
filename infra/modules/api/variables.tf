variable "project" {
  description = "Project name used in resource names and tags."
  type        = string
  default     = "token-designer"
}

variable "stage" {
  description = "Environment name (dev or prod)."
  type        = string
}

variable "tags" {
  description = "Extra tags merged into all resources in this module."
  type        = map(string)
  default     = {}
}

variable "cognito_user_pool_id" {
  description = "Cognito user pool ID (JWT issuer)."
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito app client ID (JWT audience)."
  type        = string
}

variable "lambda_invoke_arn" {
  description = "Invoke ARN of the api Lambda (integration target)."
  type        = string
}

variable "lambda_name" {
  description = "Name of the api Lambda (for the invoke permission)."
  type        = string
}

output "api_endpoint" {
  description = "HTTP API endpoint without stage."
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "api_domain_name" {
  description = "execute-api domain name without scheme (CloudFront API origin)."
  value       = replace(aws_apigatewayv2_api.main.api_endpoint, "https://", "")
}

output "api_url" {
  description = "Full execute-api URL (stage api). Use for the Vite dev proxy."
  value       = "${aws_apigatewayv2_api.main.api_endpoint}/api"
}

output "api_id" {
  description = "HTTP API id (needed for the CloudFront origin in Phase 5)."
  value       = aws_apigatewayv2_api.main.id
}

output "execution_arn" {
  description = "Execution ARN of the HTTP API."
  value       = aws_apigatewayv2_api.main.execution_arn
}
