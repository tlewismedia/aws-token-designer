variable "project" {
  description = "Project name used in resource names and tags."
  type        = string
  default     = "token-designer"
}

variable "stage" {
  description = "Environment name (dev or prod)."
  type        = string
}

variable "alert_email" {
  description = "Email address for budget, anomaly, and alarm notifications. Override per env; keep the real address out of the public repo."
  type        = string
  default     = "alerts@example.com"
}

variable "tags" {
  description = "Extra tags merged into all resources in this module."
  type        = map(string)
  default     = {}
}
