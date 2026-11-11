# api Lambda: router + upload processing (sharp from the arm64 layer).
# Generated per docs/PLAN.md section 7.3: esbuild bundles apps/api to
# dist/index.mjs (scripts/build-lambda.sh), archive_file zips it, and sharp
# itself is NOT bundled — it comes from the Docker-built layer in this module.

data "archive_file" "api" {
  type        = "zip"
  output_path = "${path.module}/.terraform/api.zip"

  source {
    content  = file("${var.source_dist}/index.mjs")
    filename = "index.mjs"
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
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project}-${var.stage}-api"
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

  environment {
    variables = {
      TABLE_NAME   = var.table_name
      MEDIA_BUCKET = var.media_bucket_name
      NODE_OPTIONS = "--enable-source-maps"
      PRESIGN_TTL  = "3600"
    }
  }

  # PLAN 7.6 wants a reservation (10), but that requires account headroom;
  # the dev account limit is 10, so envs/dev passes -1 (unreserved).
  reserved_concurrent_executions = var.reserved_concurrency

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 7 # dev; prod gets 30 days in Phase 6

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
