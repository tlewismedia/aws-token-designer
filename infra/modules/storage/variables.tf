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
  description = "Protect the media bucket from deletion. Prod passes true: a bucket policy denies s3:DeleteBucket (S3 has no native deletion protection and Terraform lifecycle only accepts literals). Dev leaves false so the stack can be torn down. The web bucket is protected by the matching statement added by the cloudfront module."
  type        = bool
  default     = false
}
