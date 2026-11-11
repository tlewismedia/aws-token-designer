# HTTP API: stage api, Cognito JWT authorizer, Lambda proxy integration.
# Same-origin design (PLAN 7.4): no CORS — CloudFront proxies /api/* and the
# Vite dev server proxies in local development.

data "aws_region" "current" {}

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project}-${var.stage}-api"
  protocol_type = "HTTP"
  description   = "AWS Token Designer core API"

  tags = var.tags
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  name             = "cognito"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [var.cognito_client_id]
    # Cognito user-pool tokens carry iss = https://cognito-idp.<region>.amazonaws.com/<poolId>
    # (not the hosted-UI domain — this pool has none). API Gateway compares
    # iss exactly, so the hosted-UI form would 401 every authenticated route.
    issuer = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000 # under the 30s Lambda timeout
}

# Route key -> whether the route requires the JWT authorizer.
# Everything is authenticated except /health (PLAN 6.4). HEAD has no implicit
# route in an HTTP API, so "HEAD /health" keeps `curl -I` / monitoring probes
# through CloudFront from 404ing (Hono serves HEAD as GET).
locals {
  routes = {
    "GET /health"                        = false
    "HEAD /health"                       = false
    "GET /me"                            = true
    "GET /images"                        = true
    "POST /images/upload-url"            = true
    "POST /images/{id}/complete"         = true
    "POST /images/generate"              = true
    "GET /jobs/{jobId}"                  = true
    "DELETE /images/{id}"                = true
    "GET /sheets"                        = true
    "POST /sheets"                       = true
    "PATCH /sheets/{id}"                 = true
    "DELETE /sheets/{id}"                = true
    "POST /sheets/{id}/images"           = true
    "DELETE /sheets/{id}/images/{index}" = true
    "POST /checkout/session"             = true
    "GET /checkout/session/{id}"         = true
    # Stripe webhook: no Cognito authorizer; signature verification is its auth
    # (ADR-0007). Reached at <execute-api>/api/webhooks/stripe.
    "POST /webhooks/stripe" = false
  }
}

resource "aws_apigatewayv2_route" "routes" {
  for_each = local.routes

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = each.value ? "JWT" : "NONE"
  authorizer_id      = each.value ? aws_apigatewayv2_authorizer.jwt.id : null
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.project}-${var.stage}-api"
  retention_in_days = 7 # dev; prod gets 30 days in Phase 6

  tags = var.tags
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "api"
  auto_deploy = true

  # PLAN 7.6: 10 rps, burst 20.
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      integrationError = "$context.integration.error"
      latencyMs        = "$context.responseLatency"
    })
  }

  tags = var.tags
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
