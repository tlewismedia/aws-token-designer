# ADR-0007: Use the Execute-API URL for the Stripe Webhook

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

Stripe needs a public HTTPS endpoint for webhooks. It sends JSON with a `Stripe-Signature` header, requires the raw body for signature verification, and does not use Cognito auth.

## Options Considered

1. **API Gateway execute-api URL** — direct to API Gateway; raw body preserved; no CDN; API Gateway logs/throttling; server-to-server.
2. **CloudFront `/api/webhooks/stripe`** — single public domain and hides the execute-api URL, but adds CDN behavior and debugging complexity.
3. **Dedicated Lambda Function URL** — bypasses both, but adds another endpoint/function/IAM role.

## Decision

Use the **execute-api URL** for the Stripe webhook in v1.

## Consequences

- Positive: fewest moving parts; raw body and headers are direct; easy to test with the Stripe CLI.
- Negative: exposes the execute-api URL; if the execute-api endpoint is disabled later, the webhook must move; the URL changes if the API is recreated.
- Follow-ups: verify signatures against the raw body; idempotent DynamoDB transaction; update the Stripe dashboard endpoint if the API is recreated.
