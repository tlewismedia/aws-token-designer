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
  description = "Extra CORS origins for presigned PUT to the media bucket. The CloudFront distribution origin is appended automatically by the cloudfront module."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "stripe_price_id" {
  description = "Non-secret Stripe price id for one credit purchase (test mode for the demo). Empty disables checkout (503 BILLING_DISABLED)."
  type        = string
  default     = "price_1SKV9BRJneXS2FG6lEiXjYKH"
}

variable "web_origin" {
  description = "SPA origin for the Stripe Checkout return URL (the CloudFront web_url)."
  type        = string
  default     = "https://d9uvrrzcx293u.cloudfront.net"
}

variable "credits_per_purchase" {
  description = "Credits granted per completed purchase (server-controlled)."
  type        = number
  default     = 10
}
