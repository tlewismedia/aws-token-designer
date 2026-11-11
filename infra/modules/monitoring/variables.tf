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

# --- Phase 6 alarm inputs ---------------------------------------------------
# The platform alarms below need the concrete resource names/ids because
# CloudWatch dimensions identify individual resources. Envs pass the module
# outputs so the alarms always track the deployed resources (no hardcoding).

variable "api_id" {
  description = "HTTP API id (AWS/ApiGateway ApiId dimension)."
  type        = string
}

variable "api_lambda_name" {
  description = "Name of the api Lambda (AWS/Lambda FunctionName dimension)."
  type        = string
}

variable "worker_lambda_name" {
  description = "Name of the generateWorker Lambda (AWS/Lambda FunctionName dimension)."
  type        = string
}

variable "table_name" {
  description = "DynamoDB single-table name (AWS/DynamoDB TableName dimension)."
  type        = string
}
