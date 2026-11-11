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

variable "prevent_destroy" {
  description = "Protect the web and media buckets from destruction. NOTE: Terraform lifecycle.prevent_destroy only accepts literal values, so the buckets are protected unconditionally in main.tf; this input documents the prod intent (true) vs dev (false) and keeps the module API aligned with dynamodb/cognito. Dev teardown needs a temporary edit — see docs/TERRAFORM.md."
  type        = bool
  default     = false
}
