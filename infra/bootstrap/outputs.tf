output "state_bucket_name" {
  description = "Name of the S3 bucket used for Terraform state. Copy into infra/envs/<env>/backend.hcl (gitignored)."
  value       = aws_s3_bucket.state.id
}

output "state_bucket_arn" {
  description = "ARN of the Terraform state bucket."
  value       = aws_s3_bucket.state.arn
}
