# Same-origin hosting (PLAN 7.4, ADR-0003):
#
#   default behavior /*   -> S3 web bucket (OAC)          — the SPA
#   ordered behavior /api/* -> execute-api stage "api"    — the API
#
# The browser only ever sees the CloudFront domain, so the SPA calls relative
# /api paths: no CORS, no absolute API URL at build time.
#
# SPA deep links — deliberate deviation from the PLAN's "403/404 -> /index.html"
# wording: CloudFront `custom_error_response` is distribution-wide, so rewriting
# 403/404 would also rewrite real API semantics (cross-user 403, missing 404)
# into index.html 200. Instead the viewer-request function below runs only on
# the default /* behavior and rewrites extensionless paths to /index.html. API
# statuses stay intact and custom_error_response is intentionally unset. See
# docs/TERRAFORM.md.

data "aws_region" "current" {}

# Managed policy ids, documented in the CloudFront developer guide. Using the
# managed ids keeps the distribution small; origin-request policy is the
# "AllViewerExceptHostHeader" one because execute-api must receive its own Host.
locals {
  cache_policy_caching_optimized                      = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_policy_caching_disabled                       = "4135ea2d-6df8-a3-9df3-4b5a84be39ad"
  origin_request_policy_all_viewer_except_host_header = "b689b0a8-53d0-40ab-baf2-68738e2966ac"

  media_allowed_origins = distinct(concat(
    var.media_allowed_origins,
    ["https://${aws_cloudfront_distribution.main.domain_name}"],
  ))

  # CSP for the current app: Vite emits same-origin module scripts/styles;
  # Cognito is the only cross-origin API; media images are presigned S3 URLs;
  # js.stripe.com is reserved for the later embedded checkout (frame-src).
  content_security_policy = join("; ", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.amazonaws.com",
    "connect-src 'self' https://cognito-idp.${data.aws_region.current.name}.amazonaws.com https://*.amazonaws.com https://api.stripe.com",
    "frame-src https://js.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ])
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.project}-${var.stage}-web-oac"
  description                       = "OAC for the ${var.project}-${var.stage}-web SPA bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Runs on the default /* behavior only (never /api/*). Extensionless paths are
# SPA routes (/return, /login, ...) and become /index.html; asset requests keep
# their path because the last segment contains a dot. Query strings survive
# untouched (enough for /return?session_id=...).
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.project}-${var.stage}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite extensionless SPA deep links to /index.html (viewer-request, default behavior only)"
  publish = true

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
      if (lastSegment.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.project}-${var.stage}-security-headers"
  comment = "HSTS, nosniff, frame deny, referrer policy, CSP for the same-origin SPA"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000 # 1 year
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    content_security_policy {
      content_security_policy = local.content_security_policy
      override                = true
    }
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project}-${var.stage} SPA + API (same origin)"
  default_root_object = "index.html"
  # PriceClass_100 = US/Canada/Europe edges only; cheapest tier for a demo.
  price_class         = "PriceClass_100"
  wait_for_deployment = var.wait_for_deployment

  origin {
    origin_id                = "web"
    domain_name              = var.web_bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_domain_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # SPA: static assets from S3 (OAC), no viewer Host forwarded to S3, and the
  # deep-link rewrite function. CachingOptimized is fine because hashed assets
  # are immutable and index.html is invalidated on deploy.
  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_policy_caching_optimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # API: exact same-origin `/api/*` proxy to the execute-api stage `api`.
  # CachingDisabled: auth'd and mutation responses must never be cached.
  # AllViewerExceptHostHeader: forward Authorization/body/query strings but let
  # execute-api see its own Host (CloudFront's Host would break routing).
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_policy_caching_disabled
    origin_request_policy_id   = local.origin_request_policy_all_viewer_except_host_header
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Default CloudFront domain for now (no custom domain/ACM/Route 53 in v1).
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = var.tags
}

# OAC bucket policy: only this distribution may read the web bucket. The TODO
# in the storage module pointed here for Phase 5.
data "aws_iam_policy_document" "web_oac" {
  statement {
    sid    = "AllowCloudFrontServicePrincipalReadOnly"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${var.web_bucket_arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = var.web_bucket_id
  policy = data.aws_iam_policy_document.web_oac.json
}

# Browser presigned PUTs go straight to S3, so media CORS must name the
# deployed SPA origin. Moved here from the storage module (Phase 5) because it
# needs the distribution domain; two aws_s3_bucket_cors_configuration resources
# for one bucket would fight over the singleton API. The one-time plan shows a
# delete (storage) + create (here).
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = var.media_bucket_id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = local.media_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
