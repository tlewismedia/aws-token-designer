# ADR-0001: Use Terraform for Infrastructure as Code

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

We need reproducible AWS infrastructure for `dev` and `prod`: Cognito, DynamoDB, S3, CloudFront, API Gateway, Lambda, IAM, SSM, monitoring, and budgets. The team also wants to learn Terraform.

## Options Considered

1. **AWS CDK v2 (TypeScript)** — strong AWS integration and typed constructs, but uses CloudFormation and hides some resource details.
2. **SST v3** — excellent developer experience and live Lambda, but adds another framework and state layer.
3. **Terraform** — explicit, portable, large provider ecosystem, strong plan/state model; more setup for Lambda packaging.
4. **SAM / Serverless Framework** — good for Lambda/API, weaker for CloudFront/Cognito/Route 53.

## Decision

Use **Terraform >= 1.10** with the AWS provider, an S3 backend with native lockfile, and modules plus per-environment directories.

## Consequences

- Positive: explicit, portable, reviewable plans; no framework lock-in; good learning value.
- Negative: state management and Lambda packaging require discipline and build scripts; learning curve.
- Follow-ups: write `docs/TERRAFORM.md`; keep secrets out of state; use `prevent_destroy` for prod stateful resources.
