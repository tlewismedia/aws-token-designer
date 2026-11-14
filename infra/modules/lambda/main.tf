# api Lambda: router + upload processing (sharp from the arm64 layer).
# Generated per docs/PLAN.md section 7.3: esbuild bundles apps/api to
# dist/index.mjs (scripts/build-lambda.sh), archive_file zips it, and sharp
# itself is NOT bundled — it comes from the Docker-built layer in this module.

# Single source for the function name so the log group can be declared
# without referencing the function resource (which depends on the log group
# below — referencing aws_lambda_function here would create a graph cycle).
locals {
  api_function_name    = "${var.project}-${var.stage}-api"
  worker_function_name = "${var.project}-${var.stage}-generate-worker"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# KMS does not resolve alias ARNs in an IAM Resource, so look the AWS-managed
# SSM key up and grant Decrypt on its key ARN instead of `alias/aws/ssm`.
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

data "archive_file" "api" {
  type        = "zip"
  output_path = "${path.module}/.terraform/api.zip"

  source {
    content  = file("${var.source_dist}/index.mjs")
    filename = "index.mjs"
  }
}

data "archive_file" "worker" {
  type        = "zip"
  output_path = "${path.module}/.terraform/worker.zip"

  source {
    content  = file("${var.source_dist}/generation.mjs")
    filename = "generation.mjs"
  }
}

data "archive_file" "sharp_layer" {
  type        = "zip"
  output_path = "${path.module}/.terraform/sharp-layer.zip"

  source_dir = var.sharp_layer_dir
}

resource "aws_iam_role" "api" {
  name = "${var.project}-${var.stage}-api"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.tags
}

# Least privilege: write structured logs; touch only the single table and
# media bucket this function is designed for.
resource "aws_iam_role_policy" "api" {
  name = "${var.project}-${var.stage}-api-policy"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      },
      {
        # TransactWriteItems is the idempotent webhook fulfillment (payment +
        # profile credits) in one atomic transaction.
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:TransactWriteItems"]
        Resource = [var.table_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = ["${var.table_arn}/index/byId"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["${var.media_bucket_arn}/*"]
      },
      {
        # Async generation (POST /images/generate) — worker ARN only.
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [aws_lambda_function.worker.arn]
      },
      {
        # Stripe secret + webhook signing secret (NAMES in env, values SSM).
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.stripe_secret_param_name}",
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.stripe_webhook_secret_param_name}",
        ]
      },
      {
        # SecureString decryption with the AWS-managed aws/ssm key (key ARN,
        # not the alias ARN — same pattern as the worker policy).
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [data.aws_kms_alias.ssm.target_key_arn]
      },
    ]
  })
}

# generateWorker: least privilege for the generation pipeline only — the
# single table, media bucket writes/reads, the two SSM parameters, and logs.
resource "aws_iam_role" "worker" {
  name = "${var.project}-${var.stage}-generate-worker"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "worker" {
  name = "${var.project}-${var.stage}-generate-worker-policy"
  role = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["arn:aws:logs:*:*:*"]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
        Resource = [var.table_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = ["${var.table_arn}/index/byId"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["${var.media_bucket_arn}/*"]
      },
      {
        # Parameter names are NAMES, not values (docs/TERRAFORM.md).
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.stability_param_name}",
          "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.kill_switch_param_name}",
        ]
      },
      {
        # SecureString decryption with the AWS-managed aws/ssm key. IAM must
        # name the key ARN — an `alias/aws/ssm` alias ARN authorizes nothing.
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [data.aws_kms_alias.ssm.target_key_arn]
      },
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name = local.api_function_name
  description   = "Core API: profile, sheets, images (presign + processing)."
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 30
  role          = aws_iam_role.api.arn

  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  layers = [aws_lambda_layer_version.sharp.arn]

  # Create the (retention-configured) log group before the function so Lambda
  # cannot auto-create an unbounded-retention one first.
  depends_on = [aws_cloudwatch_log_group.api]

  environment {
    variables = {
      TABLE_NAME                       = var.table_name
      MEDIA_BUCKET                     = var.media_bucket_name
      WORKER_FUNCTION_NAME             = aws_lambda_function.worker.function_name
      NODE_OPTIONS                     = "--enable-source-maps"
      PRESIGN_TTL                      = "3600"
      STRIPE_PRICE_ID                  = var.stripe_price_id
      STRIPE_SECRET_PARAM_NAME         = var.stripe_secret_param_name
      STRIPE_WEBHOOK_SECRET_PARAM_NAME = var.stripe_webhook_secret_param_name
      WEB_ORIGIN                       = var.web_origin
      CREDITS_PER_PURCHASE             = tostring(var.credits_per_purchase)
    }
  }

  # PLAN 7.6 wants a reservation (10), but that requires account headroom;
  # the dev account limit is 10, so envs/dev passes -1 (unreserved).
  reserved_concurrent_executions = var.reserved_concurrency

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# generateWorker (PLAN 6.7): async Stability call + sharp thumbnail + S3/DDB
# writes. 120s absorbs provider latency spikes; no reserved concurrency (the
# dev account limit is 10 — see docs/PLAN.md §7.6 / ADR-0008 deviation).
resource "aws_lambda_function" "worker" {
  function_name = local.worker_function_name
  description   = "Async image generation worker (Stability AI + sharp)."
  runtime       = "nodejs22.x"
  handler       = "generation.handler"
  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 120
  role          = aws_iam_role.worker.arn

  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256

  layers = [aws_lambda_layer_version.sharp.arn]

  depends_on = [aws_cloudwatch_log_group.worker]

  environment {
    variables = {
      TABLE_NAME             = var.table_name
      MEDIA_BUCKET           = var.media_bucket_name
      STABILITY_PARAM_NAME   = var.stability_param_name
      KILL_SWITCH_PARAM_NAME = var.kill_switch_param_name
      STAGE                  = var.stage
      NODE_OPTIONS           = "--enable-source-maps"
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${local.worker_function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# Docker-built arm64 sharp layer (scripts/build-sharp-layer.sh produces
# var.sharp_layer_dir containing nodejs/node_modules/sharp).
resource "aws_lambda_layer_version" "sharp" {
  filename                 = data.archive_file.sharp_layer.output_path
  layer_name               = "${var.project}-${var.stage}-sharp"
  source_code_hash         = data.archive_file.sharp_layer.output_base64sha256
  compatible_runtimes      = ["nodejs22.x"]
  compatible_architectures = ["arm64"]

  description = "sharp (arm64 linux) built via Docker; see scripts/build-sharp-layer.sh"
}
