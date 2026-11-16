# `main.tf` — HTTP API module

**Purpose:** Create the HTTP API, its Cognito JWT authorizer, the Lambda proxy integration, all routes, and the stage that the CloudFront `/api/*` behavior targets.

## What it creates

| Resource | Role |
|---|---|
| `aws_apigatewayv2_api.main` | HTTP API (not REST API — cheaper, simpler). |
| `aws_apigatewayv2_authorizer.jwt` | Validates Cognito ID tokens at the edge. Issuer is `https://cognito-idp.<region>.amazonaws.com/<poolId>`; audience is the app client ID. |
| `aws_apigatewayv2_integration.lambda` | `AWS_PROXY` integration with payload v2. Timeout 29s. |
| `aws_apigatewayv2_route.routes` | One route per entry in `local.routes`; `authorization_type` is JWT or NONE. |
| `aws_apigatewayv2_stage.api` | Stage literally named `api`; auto-deploy; throttling 10 rps / burst 20; JSON access logs. |
| `aws_cloudwatch_log_group.access` | Access log destination. |
| `aws_lambda_permission.api` | Allows API Gateway to invoke the `api` Lambda. |

## Teaching notes

- **Why the stage is named `api`:** CloudFront forwards `/api/*` unchanged to `https://<api-id>.execute-api.<region>.amazonaws.com/api/...`. API Gateway treats the first path segment as the stage. Naming the stage `api` makes the proxy work with no rewrite.
- **Why no CORS:** the browser only sees the CloudFront origin. Same-origin requests do not need CORS. Local dev uses a Vite proxy.
- **Two unauthenticated routes:** `GET/HEAD /health` and `POST /webhooks/stripe`. The webhook is protected by the Stripe signature instead (ADR-0007).
- **29s integration timeout:** intentionally just under the Lambda’s 30s. Slow work (generation) is async.
- **Authorizer issuer gotcha:** use the `cognito-idp` issuer, not a hosted-UI domain. This pool has no hosted UI. The wrong issuer 401s every authenticated request.

## Safe changes

- Add a route to `local.routes` and a handler in the app; keep the auth flag accurate.
- Changing the stage name breaks the CloudFront proxy path; don’t.
- Throttling is a cost/abuse guardrail; tune deliberately.

## Related

- `infra/modules/cloudfront` — `/api/*` behavior
- `apps/api/src` — Hono routes
- ADR-0002, ADR-0003, ADR-0007
