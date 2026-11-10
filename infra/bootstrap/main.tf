provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "token-designer"
      Stage     = "bootstrap"
      ManagedBy = "terraform"
    }
  }
}

# State bucket. Applied FIRST, before any env references the bucket
# as a backend (see docs/TERRAFORM.md "bootstrap").
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # SSE-S3 (no KMS cost)
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
