output "user_pool_id" {
  description = "Cognito user pool ID (VITE_COGNITO_USER_POOL_ID)."
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito user pool ARN (JWT authorizer issuer in Phase 2)."
  value       = aws_cognito_user_pool.main.arn
}

output "client_id" {
  description = "Cognito app client ID (VITE_COGNITO_CLIENT_ID)."
  value       = aws_cognito_user_pool_client.main.id
}

output "presignup_lambda_arn" {
  description = "ARN of the pre-sign-up auto-confirm Lambda."
  value       = aws_lambda_function.presignup.arn
}
