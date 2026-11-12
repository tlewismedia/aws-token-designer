# RAID — AWS Token Designer

> Extracted from `docs/PLAN.md` §§6–7, 10 (v1.0, 2026-11-09). Living log:
> update this file when risks change or issues/dependencies are added.
> Last synced: 2026-11-12 (M7 UI parity).

## Risks

Status: **Mitigated** = control is in place and verified; **Monitored** =
accepted with an alarm/check; **Open** = action still needed.

| Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|
| `sharp` packaging fails on Lambda (arm64 layer) | Medium | High | Docker-built arm64 layer; verified with `scripts/smoke-sharp-layer.sh` in an arm64 container. | Mitigated |
| CloudFront `/api/*` path mapping wrong | Medium | High | Verified in dev: SPA + same-origin API, deep links, API statuses preserved; execute-api fallback remains. | Mitigated |
| Stripe signature / raw-body issues | Medium | High | Unit tests sign real fixtures with `Stripe.webhooks.generateTestHeaderString`; webhook uses the execute-api URL. Live checkout still pending operator keys. | Monitored |
| AI cost abuse | Medium | Medium | Per-user daily cap (20), fail-closed kill switch, daily count/cost alarms, API throttling, budget. | Mitigated |
| Terraform learning curve | Medium | Medium | `docs/TERRAFORM.md` primer, per-env state, plan review, deletion protection on prod stateful resources. | Mitigated |
| Free-tier changes | Low | Low | Budget ($1/$5/$10/$25), alarms, cost doc, weekly Cost Explorer check. Cost Anomaly Detection is blocked by an account quota (see Issues). | Monitored |
| Cold starts | Low | Low | arm64, small bundles, no provisioned concurrency (accepted for a demo). | Monitored |
| DynamoDB throttling | Low | Low | On-demand table, SDK retries, `ReadThrottleEvents`/`WriteThrottleEvents` alarms. | Monitored |
| Print quality | Low | Low | Thumbnail printing kept for parity; documented later improvement. | Monitored |
| No real-time updates | Low | Low | Polling + refetch-on-focus (accepted). | Monitored |
| Auto-confirm sign-ups | Medium | Medium | Demo-only; documented; production would enable verification. | Monitored |
| Account Lambda concurrency limit is 10 | High | Medium | Both functions run unreserved; raise quota then set reservations (PLAN §7.6). | Open (external quota) |
| Missing Stability/Stripe SecureStrings | High | Medium | Deployable failure paths verified (`GENERATION_DISABLED`, `503 BILLING_DISABLED`); operator must create the parameters (backlog #29/#34). | Open (operator) |
| Cost Anomaly Detection quota | Low | Low | Account already has a DIMENSIONAL monitor; a second is rejected. Budget is the primary guardrail. | Monitored |
| Print layout drift from the source sheet | Low | Medium | Source print CSS is kept (7.5in × 10in, 63-cell grid, hidden chrome). Playwright asserts the print-media geometry/chrome when the dev E2E runs; the manual print preview check is in `docs/TESTING.md`. | Monitored |
| CSP blocks or leaks font/billing origins | Low | Medium | Fonts are self-hosted (`@fontsource`) and CSP is `font-src 'self'`. `connect-src`/`frame-src` still reserve Stripe origins for a future purchase UI; `/buy-credits` makes no Stripe or checkout request. Re-check response headers after each deploy. | Monitored |
| Source-parity UI inherits weak a11y patterns | Medium | Medium | Port adds `aria-label`s, dialog semantics/focus return, and inline auth errors, but overlay actions are still hover-revealed and contrast is not automated. NFR-8 keeps the source baseline; a full WCAG 2.1 AA pass is follow-up work if the demo is promoted. | Monitored |

## Assumptions

- AWS account with permissions to create the resources; billing alerts enabled.
- Stability API key and Stripe test account/keys available (currently missing —
  see Issues #29/#34).
- Terraform >= 1.10 and AWS CLI configured locally.
- Node 22 via `.nvmrc`.
- Demo traffic only; no SLA.
- Hybrid local dev (local Vite + dev AWS resources).
- AWS default URLs; custom domain deferred.
- Auto-confirm Cognito users (demo parity; documented tradeoff).
- Region: `us-west-2`.

## Issues

| Date | Issue | Status |
|---|---|---|
| 2026-11-11 | Phase 1: Cognito pre-sign-up handler used CommonJS `exports` in an ESM `index.mjs`, so sign-up failed with "exports is not defined in ES module scope". Fixed by exporting `handler` with ESM syntax. | Fixed |
| 2026-11-11 | Phase 3: IAM granted `kms:Decrypt` on the `alias/aws/ssm` alias ARN; KMS does not resolve aliases in a Resource. Fixed by looking up `data.aws_kms_alias.ssm.target_key_arn` and granting on the key ARN. | Fixed |
| 2026-11-11 | Phase 3: worker lease/retry timing. If the lease were shorter than the 120 s worker timeout, a retry could duplicate work; if longer than Lambda's ~180 s first retry, a crashed worker would strand the job. Set to 150 s (between the two) and documented. | Fixed |
| 2026-11-11 | Phase 5: media bucket CORS rule moved from `storage` to `cloudfront` (needs the distribution origin). S3 has one CORS singleton per bucket, so a `moved` block updates it in place instead of racing create/destroy. | Fixed |
| 2026-11-11 | Phase 5: CloudFront cache/origin policy ids were hardcoded managed ids. Documented (`CachingOptimized`, `CachingDisabled`, `AllViewerExceptHostHeader`) and commented in the module; no API to validate them beyond successful deploy/verification. | Mitigated |
| 2026-11-11 | Phase 5: PLAN's "403/404 → /index.html" would rewrite real API statuses distribution-wide. Replaced with a viewer-request CloudFront Function on the default behavior only; documented deviation. | Fixed (deviation) |
| 2026-11-11 | Phase 6: Terraform `lifecycle.prevent_destroy` accepts only literal values, so the requested module variable cannot drive it. DynamoDB/Cognito use native deletion protection (`deletion_protection_enabled` / `deletion_protection`); S3 uses prod-only bucket policies denying `s3:DeleteBucket` (dev stays destroyable). Documented in `docs/TERRAFORM.md`. | Mitigated (deviation) |
| 2026-11-11 | Phase 6: no Stability AI SecureString exists, so live generation cannot succeed. The failure path is verified; success needs an operator key. | Open — backlog #29 |
| 2026-11-11 | Phase 6: no Stripe SecureStrings/price id exist, so checkout/webhook cannot fulfil. Failure paths are verified; live test-mode checkout needs operator keys. | Open — backlog #34 |
| 2026-11-11 | Phase 6: account `UnreservedConcurrentExecutions` minimum (10) leaves no room for the planned reservations; both Lambdas run unreserved. | Open — external quota |
| 2026-11-12 | M7: DynamoDB Local integration test `lists images newest first` was flaky because both rows shared one `createdAt` millisecond. Fixed by using distinct timestamps and asserting both id and `createdAt` order; the newest-first assertion is unchanged. | Fixed |

## Dependencies

- External services: Stability AI (generation), Stripe (checkout/webhook).
- AWS managed services: Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront,
  SSM, SNS, CloudWatch, Budgets.
- Tooling: Node 22, Terraform >= 1.10, Docker (diagram render + `sharp` layer
  build), D2 (via Docker), Playwright/Chromium for E2E.
- GitHub: Actions (CI), Dependabot, OIDC role for the optional Terraform plan
  job (repo variable `AWS_PLAN_ROLE_ARN`).
- Source parity reference: `/Users/tomlewis/prj/firebase-token-designer` (local
  only, not vendored).

## Current status (2026-11-11)

- **dev:** deployed and verified through Phase 5; Phase 6 alarm matrix and
  monitoring/log-retention changes are defined on this branch, pending apply.
- **prod:** environment added (`infra/envs/prod`), `terraform plan` clean
  (72 creates, read-only), **not applied**; prod smoke limited to no-key paths.
- **Tests:** unit/component/integration green; E2E green against dev; CI covers
  lint/typecheck/build/tests/validate and an optional dev plan.
- **Blockers:** Stability/Stripe operator keys (#29/#34) and the account
  concurrency quota (reservations).
