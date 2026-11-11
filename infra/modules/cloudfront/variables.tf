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

# --- SPA origin -------------------------------------------------------------

variable "web_bucket_id" {
  description = "ID/name of the web bucket that stores the built SPA."
  type        = string
}

variable "web_bucket_arn" {
  description = "ARN of the web bucket (target of the OAC GetObject policy)."
  type        = string
}

variable "web_bucket_regional_domain_name" {
  description = "Regional S3 domain name of the web bucket (CloudFront S3 origin)."
  type        = string
}

# --- API origin -------------------------------------------------------------

variable "api_domain_name" {
  description = "execute-api domain name WITHOUT scheme, e.g. abc123.execute-api.us-west-2.amazonaws.com (from the api module's api_domain_name output)."
  type        = string
}

# --- Media bucket CORS ------------------------------------------------------

variable "media_bucket_id" {
  description = "ID/name of the media bucket. The browser's presigned PUT CORS rule lives here so it can include the distribution domain."
  type        = string
}

variable "media_allowed_origins" {
  description = "Extra CORS origins for presigned PUT to the media bucket. The distribution origin (https://<distribution domain>) is appended automatically."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

# --- Distribution behavior --------------------------------------------------

variable "wait_for_deployment" {
  description = "Wait for the CloudFront distribution to deploy before apply returns. Deploys take several minutes; false makes local iteration faster."
  type        = bool
  default     = true
}

variable "protect_from_deletion" {
  description = "Add a Deny s3:DeleteBucket statement to the web-bucket policy. Prod passes true; dev leaves false so the stack can be torn down."
  type        = bool
  default     = false
}
