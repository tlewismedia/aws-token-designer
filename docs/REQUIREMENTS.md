# Requirements — AWS Token Designer

> Extracted from `docs/PLAN.md` §5 (v1.0, 2026-11-09). The plan is the
> source of truth; this file is the testable index. Last synced: 2026-11-10.

## Functional Requirements

| ID | Requirement | Acceptance |
|---|---|---|
| FR-1 | Register, login, logout with email/password | Cognito user created; session persists; logout clears session and query cache |
| FR-2 | Show user profile and credit balance | Navbar shows credits from `GET /api/me` |
| FR-3 | Create default sheet on first login | Profile bootstrap creates `PROFILE` + one `SHEET` idempotently |
| FR-4 | Generate an image from name, description, style, negative prompt | Job created; image appears in gallery after polling |
| FR-5 | Upload an image via drag/drop or file picker | Max 10 MB; image types only; thumbnail created; appears in gallery |
| FR-6 | List generated/uploaded images with thumbnails | Gallery loads presigned thumb URLs |
| FR-7 | Add an image to the latest sheet | Max 63 tokens; duplicate adds allowed as in source |
| FR-8 | Remove a token from the sheet | Removes by index; sheet updates |
| FR-9 | Clear the sheet | `images` becomes empty |
| FR-10 | Delete an image | S3 full + thumb deleted; DB item deleted; removed from all sheets |
| FR-11 | Print the sheet | Browser print dialog; up to 63 tokens |
| FR-12 | Stripe checkout + return page status | Checkout session created; return page shows fulfillment state; purchase UI stays disabled |
| FR-13 | Marketing page when logged out; builder when logged in | Matches current Home behavior |
| FR-14 | Protected routes for checkout/return | Unauthenticated users redirected to `/login` |

## Non-Functional Requirements

| ID | Requirement | Target / Verification |
|---|---|---|
| NFR-1 | Performance | p95 CRUD < 500 ms; generation accepted < 1 s; image load < 2 s on broadband; CloudWatch/API Gateway metrics |
| NFR-2 | Availability | Best-effort 99.9% monthly for demo; no SLA |
| NFR-3 | Security | No secrets in repo; all routes authenticated except webhook/health; least-privilege IAM; OWASP Top 10 mitigations; gitleaks clean |
| NFR-4 | Cost | AWS infra < $5/month at demo traffic; budgets at $1/$5/$10/$25; AI daily cap enforced |
| NFR-5 | Operability | Structured logs, alarms, runbook; deploy < 15 minutes; rollback documented |
| NFR-6 | Reliability | Payment fulfillment idempotent; transient webhook failures return 5xx; no lost credits |
| NFR-7 | Maintainability | TypeScript strict; shared zod schemas; unit + integration + E2E tests |
| NFR-8 | Accessibility | WCAG 2.1 AA for new/modified UI; preserve current baseline |
| NFR-9 | Data retention | Images retained until user deletes; no PII beyond email |
| NFR-10 | Privacy | No analytics/tracking; no third-party scripts beyond Stripe.js |

## Out of scope (v1)

No Firebase migration; no custom domain/Route 53/ACM; no real-time
updates (polling + refetch-on-focus); no multi-sheet UI, account page, or
purchase enablement; thumbnail printing only; no social login, MFA,
password reset, or email verification; no mobile app, analytics, or
marketing automation; no multi-region/DR/HA beyond managed defaults.
See `docs/PLAN.md` §2.
