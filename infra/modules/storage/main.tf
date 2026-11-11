# S3 has no native deletion-protection attribute and Terraform's
# `lifecycle.prevent_destroy` accepts only literal values, so the module uses
# a prod-gated bucket policy that denies `s3:DeleteBucket` (see
# aws_s3_bucket_policy.media_delete_protection below and the matching statement
# in the cloudfront module's web-bucket policy). Dev leaves prevent_destroy
# false, so its buckets stay destroyable.
resource "aws_s3_bucket" "web" {
  bucket = "${var.project}-${var.stage}-web"

  tags = var.tags
}

resource "aws_s3_bucket" "media" {
  bucket = "${var.project}-${var.stage}-media"

  tags = var.tags
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # SSE-S3
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # SSE-S3
    }
  }
}

# Phase 5 moved the web-bucket OAC policy and the media bucket's presigned-PUT
# CORS rule into infra/modules/cloudfront: both need the distribution ARN/domain.
# There is deliberately no *web* bucket policy here (cloudfront owns it and adds
# the matching prod-only delete-protection statement).

# Prod-only deletion protection for the media bucket. An explicit Deny wins
# over the operator's IAM Allow, so `terraform destroy` fails at DeleteBucket.
# The web bucket's statement lives in the cloudfront module's bucket policy
# (S3 allows one bucket policy per bucket). See docs/TERRAFORM.md.
data "aws_iam_policy_document" "media_delete_protection" {
  statement {
    sid    = "DenyBucketDeletion"
    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions   = ["s3:DeleteBucket"]
    resources = [aws_s3_bucket.media.arn]
  }
}

resource "aws_s3_bucket_policy" "media_delete_protection" {
  count  = var.prevent_destroy ? 1 : 0
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_delete_protection.json
}

resource "aws_s3_bucket_lifecycle_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
