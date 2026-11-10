output "web_bucket_name" {
  description = "Name of the S3 bucket hosting the built SPA."
  value       = aws_s3_bucket.web.id
}

output "web_bucket_arn" {
  description = "ARN of the web bucket (OAC policy target in Phase 5)."
  value       = aws_s3_bucket.web.arn
}

output "media_bucket_name" {
  description = "Name of the private S3 bucket for full + thumbnail images."
  value       = aws_s3_bucket.media.id
}

output "media_bucket_arn" {
  description = "ARN of the media bucket (IAM policies in Phase 2)."
  value       = aws_s3_bucket.media.arn
}
