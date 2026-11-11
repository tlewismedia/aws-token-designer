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

variable "generation_metric_namespace" {
  description = "CloudWatch namespace emitted by the generateWorker EMF metrics."
  type        = string
  default     = "TokenDesigner"
}

variable "daily_generation_alarm_threshold" {
  description = "Daily generation count that triggers an alarm (dev default: 50, i.e. 2.5x the per-user cap)."
  type        = number
  default     = 50
}

variable "daily_ai_cost_alarm_threshold_usd" {
  description = "Daily estimated AI spend (USD) that triggers an alarm (dev default: $5)."
  type        = number
  default     = 5
}
