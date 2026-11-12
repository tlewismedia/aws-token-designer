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
  description = "Refuse to destroy the table. Prod passes true (PLAN 7.1); dev leaves the default."
  type        = bool
  default     = false
}
