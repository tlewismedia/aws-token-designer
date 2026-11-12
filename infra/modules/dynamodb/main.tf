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

  attribute {
    name = "entityId"
    type = "S"
  }

  # byId GSI: lets the api Lambda look up an image/sheet id across user
  # partitions so it can answer 404 (missing) vs 403 (owned by another user)
  # — see docs/PLAN.md section 6.5 and the route ownership checks.
  global_secondary_index {
    name            = "byId"
    hash_key        = "entityId"
    projection_type = "ALL"
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

  # Native deletion protection (Terraform lifecycle.prevent_destroy only
  # accepts literal values, so a module variable cannot drive it). Prod sets
  # prevent_destroy = true, which enables this and makes `terraform destroy`
  # fail; dev leaves it false so the stack can be torn down.
  deletion_protection_enabled = var.prevent_destroy

  tags = var.tags
}
