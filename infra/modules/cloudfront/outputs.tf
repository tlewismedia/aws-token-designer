output "distribution_id" {
  description = "CloudFront distribution ID (invalidation target in scripts/deploy-web.sh)."
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_domain_name" {
  description = "Default CloudFront domain name (no scheme), e.g. dxxxx.cloudfront.net."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_arn" {
  description = "ARN of the CloudFront distribution (OAC policy condition)."
  value       = aws_cloudfront_distribution.main.arn
}

output "distribution_hosted_zone_id" {
  description = "CloudFront hosted zone ID (Route 53 alias target when a custom domain lands)."
  value       = aws_cloudfront_distribution.main.hosted_zone_id
}
