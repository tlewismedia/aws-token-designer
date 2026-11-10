# ADR-0006: Use Custom Cognito Forms with Auto-Confirm

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

The current app uses custom email/password forms and signs users in immediately after registration. We want an exact port with the simplest login UX for now, and there are no existing users to migrate.

## Options Considered

1. **Cognito Hosted UI** — least auth UI code, secure defaults, but a redirect flow and limited branding.
2. **Custom forms + Amplify Auth + auto-confirm** — exact UX; no verification, reset, or MFA; demo-friendly.
3. **Custom forms + email verification** — more secure, but adds a confirmation screen and email delivery.

## Decision

Use **custom React forms + Amplify Auth v6**, with a pre-sign-up Lambda that auto-confirms and auto-verifies email. Profile and default sheet are created lazily on the first authenticated `GET /api/me`.

## Consequences

- Positive: exact parity with the current login/register UX; no hosted UI domain; simple onboarding.
- Negative: anyone can register with any email; no password reset or MFA; not production-grade auth.
- Follow-ups: switch to verification + SES and add reset/MFA before treating this as a real product; keep rate limits and generation caps.
