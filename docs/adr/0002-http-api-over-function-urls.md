# ADR-0002: Use API Gateway HTTP API over Lambda Function URLs

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

The API needs Cognito authentication, routing, throttling, access logs, and (later) a custom domain, at near-zero cost for a demo.

## Options Considered

1. **API Gateway HTTP API** — built-in Cognito JWT authorizer, CORS, throttling, access logs, custom domains. 30s integration timeout and 10 MB payload limit.
2. **Lambda Function URLs** — no API Gateway charge and longer invocations, but no built-in Cognito authorizer, CORS, routing, or throttling; custom domain needs CloudFront.
3. **API Gateway REST API** — more features, ~3.5x the request cost.

## Decision

Use **API Gateway HTTP API** with a Cognito JWT authorizer and a small number of Lambda functions.

## Consequences

- Positive: auth, CORS, routing, throttling, and logs are configuration rather than custom code; less security-sensitive plumbing to maintain.
- Negative: 30s/10MB limits; ~$1/million requests after the free tier.
- Mitigations: generation is an async job; uploads use presigned S3; the same-origin CloudFront proxy removes the need for CORS.
