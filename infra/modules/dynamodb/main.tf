# Single table per docs/PLAN.md section 6.5.
# Entities share PK (USER#<sub> or PAYMENT#<id>) + SK (PROFILE, IMAGE#<ulid>,
# SHEET#<ulid>, PAYMENT, JOB#<ulid>, RATE#<date>).

resource "aws_dynamodb_table" "main" {
  name         = "${var.project}-${var.stage}"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt" # jobs + daily RATE items expire out
    enabled        = true
  }

  server_side_encryption {
    enabled = true # AWS-owned key (no KMS cost)
  }

  # Demo default: PITR off to stay near-zero cost. Revisit for prod in Phase 6.
  point_in_time_recovery {
    enabled = false
  }

  tags = var.tags
}
