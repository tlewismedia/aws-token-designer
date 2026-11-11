variable "project" {
  description = "Project name used in resource names and tags."
  type        = string
  default     = "token-designer"
}

variable "stage" {
  description = "Environment name. Keep prod here; dev lives in infra/envs/dev."
  type        = string
  default     = "prod"
}

variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-west-2"
}

variable "alert_email" {
  description = "Email for SNS budget/anomaly/alarm notifications. Pass the real address via -var or tfvars (gitignored); the default is a placeholder."
  type        = string
  default     = "alerts@example.com"
}

variable "media_allowed_origins" {
  description = "Extra CORS origins for presigned PUT to the media bucket. The CloudFront distribution origin is appended automatically by the cloudfront module."
  type        = list(string)
  # Prod does not add extra origins: only the deployed CloudFront SPA uploads
  # directly to S3. Add a specific origin here if a second trusted frontend
  # ever needs presigned PUTs.
  default = []
}

variable "stripe_price_id" {
  description = "Non-secret Stripe price id for one credit purchase. Empty disables checkout (503 BILLING_DISABLED)."
  type        = string
  default     = ""
}

variable "web_origin" {
  description = "SPA origin for the embedded Checkout return URL. Defaults to empty; after the CloudFront distribution exists set it to the web_url output (see infra/envs/prod/main.tf)."
  type        = string
  default     = ""
}

variable "credits_per_purchase" {
  description = "Credits granted per completed purchase (server-controlled)."
  type        = number
  default     = 10
}
