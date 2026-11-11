variable "project" {
  description = "Project name used in resource names and tags."
  type        = string
  default     = "token-designer"
}

variable "stage" {
  description = "Environment name. Keep dev here; prod gets its own env dir in Phase 6."
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-west-2"
}

variable "alert_email" {
  description = "Email for SNS budget/anomaly notifications. Pass the real address via -var or tfvars (gitignored); the default is a placeholder."
  type        = string
  default     = "alerts@example.com"
}

variable "media_allowed_origins" {
  description = "CORS origins for presigned PUT to the media bucket. Add the CloudFront domain in Phase 5."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "stripe_price_id" {
  description = "Non-secret Stripe price id for one credit purchase. Empty disables checkout (503 BILLING_DISABLED)."
  type        = string
  default     = ""
}

variable "web_origin" {
  description = "SPA origin for the embedded Checkout return URL."
  type        = string
  default     = "http://localhost:5173"
}

variable "credits_per_purchase" {
  description = "Credits granted per completed purchase (server-controlled)."
  type        = number
  default     = 10
}
