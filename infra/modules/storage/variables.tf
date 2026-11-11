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

variable "media_allowed_origins" {
  description = "CORS origins allowed to PUT directly to the media bucket. Add the CloudFront domain in Phase 5; localhost covers Vite dev."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "cloudfront_distribution_arn" {
  description = "TODO (Phase 5): CloudFront distribution ARN for the web-bucket OAC policy. Empty until the distribution lands — no bucket policy is attached yet."
  type        = string
  default     = ""
}
