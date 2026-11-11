output "web_bucket_name" {
  description = "Name of the S3 bucket hosting the built SPA."
  value       = aws_s3_bucket.web.id
}

output "web_bucket_id" {
  description = "ID/name of the web bucket (S3 sync target and OAC policy bucket)."
  value       = aws_s3_bucket.web.id
}

output "web_bucket_arn" {
  description = "ARN of the web bucket (OAC policy target)."
  value       = aws_s3_bucket.web.arn
}

output "web_bucket_regional_domain_name" {
  description = "Regional domain name of the web bucket (CloudFront S3 origin)."
  value       = aws_s3_bucket.web.bucket_regional_domain_name
}

output "media_bucket_name" {
  description = "Name of the private S3 bucket for full + thumbnail images."
  value       = aws_s3_bucket.media.id
}

output "media_bucket_id" {
  description = "ID/name of the media bucket (CloudFront module owns its CORS rule)."
  value       = aws_s3_bucket.media.id
}

output "media_bucket_arn" {
  description = "ARN of the media bucket (IAM policies in Phase 2)."
  value       = aws_s3_bucket.media.arn
}
