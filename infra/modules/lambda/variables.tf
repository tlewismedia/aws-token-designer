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

variable "source_dist" {
  description = "Directory containing the esbuild bundle (apps/api/dist). Run scripts/build-lambda.sh first."
  type        = string
}

variable "sharp_layer_dir" {
  description = "Directory containing the built sharp layer (nodejs/node_modules/sharp). Run scripts/build-sharp-layer.sh first."
  type        = string
}

variable "reserved_concurrency" {
  description = "Reserved concurrent executions for the api Lambda (-1 = unreserved). Reserving requires an account concurrency limit comfortably above the reservation; the dev account's limit is 10, so dev leaves this unreserved."
  type        = number
  default     = -1
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for both Lambda log groups. Dev uses 7, prod 30 (PLAN 7.6)."
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a retention value supported by CloudWatch Logs."
  }
}

variable "table_name" {
  description = "DynamoDB single-table name (env var TABLE_NAME)."
  type        = string
}

variable "table_arn" {
  description = "DynamoDB table ARN for the IAM policy."
  type        = string
}

variable "media_bucket_name" {
  description = "Media bucket name (env var MEDIA_BUCKET)."
  type        = string
}

variable "media_bucket_arn" {
  description = "Media bucket ARN for the IAM policy."
  type        = string
}

variable "stability_param_name" {
  description = "SSM parameter NAME holding the Stability key (SecureString; value created out-of-band)."
  type        = string
}

variable "kill_switch_param_name" {
  description = "SSM parameter NAME for the generation kill switch (String 'true' enables generation)."
  type        = string
}

# ---------------------------------------------------------------------------
# Stripe payments (Phase 4). Terraform carries NAMES/config only; secret values
# are created out-of-band in SSM SecureString (docs/TERRAFORM.md).
# ---------------------------------------------------------------------------

variable "stripe_price_id" {
  description = "Non-secret Stripe price id for one credit purchase. Empty disables checkout with 503 BILLING_DISABLED."
  type        = string
  default     = ""
}

variable "stripe_secret_param_name" {
  description = "SSM SecureString NAME holding the Stripe secret key (env STRIPE_SECRET_PARAM_NAME)."
  type        = string
  default     = ""
}

variable "stripe_webhook_secret_param_name" {
  description = "SSM SecureString NAME holding the Stripe webhook signing secret (env STRIPE_WEBHOOK_SECRET_PARAM_NAME)."
  type        = string
  default     = ""
}

variable "web_origin" {
  description = "SPA origin used to build the embedded Checkout return_url."
  type        = string
  default     = "http://localhost:5173"
}

variable "credits_per_purchase" {
  description = "Server-controlled credits granted per completed purchase (env CREDITS_PER_PURCHASE)."
  type        = number
  default     = 10

  validation {
    condition     = var.credits_per_purchase > 0 && floor(var.credits_per_purchase) == var.credits_per_purchase
    error_message = "credits_per_purchase must be a positive integer."
  }
}

output "lambda_arn" {
  description = "ARN of the api Lambda function."
  value       = aws_lambda_function.api.arn
}

output "lambda_name" {
  description = "Name of the api Lambda function."
  value       = aws_lambda_function.api.function_name
}

output "lambda_invoke_arn" {
  description = "Invoke ARN (API Gateway integration target)."
  value       = aws_lambda_function.api.invoke_arn
}

output "sharp_layer_arn" {
  description = "ARN of the sharp layer."
  value       = aws_lambda_layer_version.sharp.arn
}

output "role_arn" {
  description = "Execution role ARN."
  value       = aws_iam_role.api.arn
}

output "worker_lambda_arn" {
  description = "ARN of the generateWorker Lambda function."
  value       = aws_lambda_function.worker.arn
}

output "worker_lambda_name" {
  description = "Name of the generateWorker Lambda function."
  value       = aws_lambda_function.worker.function_name
}

output "worker_role_arn" {
  description = "Execution role ARN of the generateWorker Lambda."
  value       = aws_iam_role.worker.arn
}
