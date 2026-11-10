variable "region" {
  description = "AWS region for the Terraform state bucket."
  type        = string
  default     = "us-west-2"
}

variable "state_bucket_name" {
  description = "Globally unique name for the Terraform state bucket. Passed on the command line so the real name stays out of the repo (see backend.hcl.example in infra/envs/dev)."
  type        = string
}
