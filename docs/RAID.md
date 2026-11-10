# RAID — AWS Token Designer

> Extracted from `docs/PLAN.md` §§6–7, 10 (v1.0, 2026-11-09). Living log:
> update this file when risks change or issues/dependencies are added.
> Last synced: 2026-11-10.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `sharp` packaging fails on Lambda (arm64 layer) | Medium | High | Build/test the arm64 layer in Phase 1; fall back to container image |
| CloudFront `/api/*` path mapping wrong | Medium | High | Verify stage/path mapping early in Phase 5; keep execute-api fallback |
| Stripe signature / raw-body issues | Medium | High | Test with Stripe CLI; use execute-api URL; log request IDs |
| AI cost abuse | Medium | Medium | Daily cap, kill switch, alarms, throttling |
| Terraform learning curve | Medium | Medium | Primer doc, small increments, plan review before apply |
| Free-tier changes | Low | Low | Budgets, anomaly detection, cost doc |
| Cold starts | Low | Low | arm64, small bundles, no provisioned concurrency |
| DynamoDB throttling | Low | Low | On-demand; retries |
| Print quality | Low | Low | Documented later improvement |

## Assumptions

- AWS account with permissions to create the resources; billing alerts enabled.
- Stability API key and Stripe test account/keys available.
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
| — | None logged yet. | — |

## Dependencies

- External services: Stability AI (generation), Stripe (checkout/webhook).
- AWS managed services: Cognito, API Gateway, Lambda, DynamoDB, S3, CloudFront, SSM, SNS/CloudWatch/Budgets.
- Tooling: Node 22, Terraform >= 1.10, Docker (diagram render + `sharp` layer build), D2 (via Docker).
- Source parity reference: `/Users/tomlewis/prj/firebase-token-designer` (local only, not vendored).
