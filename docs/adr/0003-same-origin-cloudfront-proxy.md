# ADR-0003: Use a Same-Origin CloudFront `/api/*` Proxy

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

We are using AWS default URLs in v1 (no custom domain). We want to avoid CORS configuration and a circular dependency between the SPA build (which needs the API URL) and the API (which needs the SPA origin).

## Options Considered

1. **Direct execute-api URL + CORS allowlist** — simple API, but requires CORS config and exposes the execute-api URL; the SPA needs an absolute API base URL.
2. **CloudFront same-origin `/api/*` proxy** — one public domain; relative `/api` paths; no CORS; no circular dependency.
3. **Custom domain + API Gateway custom domain** — branded, but requires ACM and DNS now.

## Decision

Use **one CloudFront distribution** with a default `/*` behavior for the SPA and a `/api/*` behavior proxying to the HTTP API stage `api`.

## Consequences

- Positive: no CORS; relative `/api` paths; adding a custom domain later requires no frontend change; SPA can be built before deploy.
- Negative: CloudFront behavior configuration (`CachingDisabled`, `AllViewer`) must be correct; the execute-api URL remains reachable.
- Follow-ups: use the execute-api URL for the Stripe webhook; verify path/stage mapping early.
