# Pre-sign-up auto-confirm trigger (demo parity: simplest login UX, no
# verification/reset/MFA — see docs/PLAN.md section 6.3).

data "archive_file" "presignup" {
  type        = "zip"
  output_path = "${path.module}/.terraform/presignup.zip"

  source {
    content  = <<-EOT
      // Demo only: auto-confirm every sign-up so login works without email verification.
      // NOTE: index.mjs is ESM scope — no `exports` object. A CommonJS
      // `exports.handler` assignment here fails at runtime with
      // "exports is not defined in ES module scope" (caught 2026-11-11
      // during Phase 1 sign-up verification).
      export const handler = async (event) => {
        event.response.autoConfirmUser = true;
        event.response.autoVerifyEmail = true;
        return event;
      };
    EOT
    filename = "index.mjs"
  }
}

resource "aws_iam_role" "presignup" {
  name = "${var.project}-${var.stage}-cognito-presignup"

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

resource "aws_iam_role_policy_attachment" "presignup_basic" {
  role       = aws_iam_role.presignup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "presignup" {
  function_name    = "${var.project}-${var.stage}-cognito-presignup"
  description      = "Auto-confirms Cognito sign-ups (demo only)."
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  role             = aws_iam_role.presignup.arn
  filename         = data.archive_file.presignup.output_path
  source_code_hash = data.archive_file.presignup.output_base64sha256

  tags = var.tags
}

resource "aws_cognito_user_pool" "main" {
  name = "${var.project}-${var.stage}"

  # Email sign-in.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length = 8
  }

  mfa_configuration = "OFF"

  user_pool_add_ons {
    advanced_security_mode = "OFF"
  }

  lambda_config {
    pre_sign_up = aws_lambda_function.presignup.arn
  }

  # Native deletion protection (Terraform lifecycle.prevent_destroy only
  # accepts literal values, so a module variable cannot drive it). Prod sets
  # prevent_destroy = true, which blocks deleting the pool (and its users);
  # dev leaves it false so the stack can be torn down.
  deletion_protection = var.prevent_destroy ? "ACTIVE" : "INACTIVE"

  tags = var.tags
}

# No hosted UI domain (custom forms + Amplify Auth only).

resource "aws_cognito_user_pool_client" "main" {
  name            = "${var.project}-${var.stage}-web"
  user_pool_id    = aws_cognito_user_pool.main.id
  generate_secret = false # public SPA client: no client secret

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_lambda_permission" "cognito_invoke" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presignup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
