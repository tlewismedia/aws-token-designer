# `main.tf` — CloudFront module (same-origin SPA + API)

**Purpose:** Serve the SPA from S3 and proxy `/api/*` to the HTTP API from **one CloudFront domain**, so the browser sees a single origin and CORS disappears.

## Core design

```text
CloudFront default /*    -> S3 web bucket (OAC)       = the SPA
CloudFront /api/*        -> execute-api stage "api"   = the API
```

This is ADR-0003. It also means the SPA uses relative `/api` paths and needs no absolute API URL at build time.

## Resources

| Resource | Why |
|---|---|
| `aws_cloudfront_origin_access_control.web` | Lets CloudFront read the private web bucket without public access. |
| `aws_cloudfront_function.spa_rewrite` | Rewrites extensionless deep links (e.g. `/return`) to `/index.html`. Runs **only** on the default behavior. |
| `aws_cloudfront_response_headers_policy.security` | HSTS, nosniff, frame deny, referrer policy, and a CSP. |
| `aws_cloudfront_distribution.main` | The distribution: S3 origin, API origin, default + `/api/*` behaviors, PriceClass_100. |
| `aws_iam_policy_document.web_oac` + `aws_s3_bucket_policy.web` | Only this distribution may read the web bucket. Prod adds a Deny `s3:DeleteBucket` statement. |
| `aws_s3_bucket_cors_configuration.media` | Presigned PUT CORS for the deployed SPA origin (and localhost in dev). |

## Teaching notes

- **Why not custom error responses?** `custom_error_response` is distribution-wide; rewriting 403/404 would also turn real API 403/404s into `index.html` 200s. A viewer-request function scoped to the default behavior is precise. The API keeps its status codes.
- **API behavior settings:** `CachingDisabled` (never cache auth’d responses) and `AllViewerExceptHostHeader` (forward Authorization/body/query, let execute-api see its own Host).
- **CSP is app-specific:** `script-src 'self'`, self-hosted fonts, Cognito + S3 + Stripe in `connect-src`, Stripe in `frame-src`. Update it when adding a third-party script.
- **Media CORS lives here, not in storage:** only this module knows the distribution domain, and S3 has one CORS singleton per bucket. The `moved` block in each env moves the existing resource without recreation.
- **Prod deletion protection:** the web bucket policy gains a Deny `s3:DeleteBucket`. Explicit Deny beats IAM Allow, so `terraform destroy` fails at DeleteBucket.

## Safe changes

- Changing cache policies/behaviors affects the whole app; plan and test in dev.
- Adding an origin/behavior is fine; keep `/api/*` uncached.
- Do not point `/api/*` at the S3 bucket or the SPA at the API origin.

## Related

- ADR-0003, `docs/PLAN.md` §7.4
- `infra/modules/api` (origin domain)
- `infra/modules/storage` (buckets)
