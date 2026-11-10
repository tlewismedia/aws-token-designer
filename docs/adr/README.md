# Architecture Decision Records (ADRs)

This directory holds the significant architecture decisions for the AWS Token Designer port. ADRs are **immutable**: to change a decision, add a new ADR that supersedes the old one.

## Format

Each ADR uses the Nygard format:

- **Title** — short decision statement.
- **Status** — Proposed / Accepted / Superseded / Deprecated.
- **Date** — decision date.
- **Deciders** — who made the decision.
- **Context** — forces at play.
- **Options considered** — alternatives and trade-offs.
- **Decision** — what we chose.
- **Consequences** — positive, negative, follow-ups.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-use-terraform.md) | Use Terraform for IaC | Accepted |
| [0002](0002-http-api-over-function-urls.md) | Use API Gateway HTTP API over Lambda Function URLs | Accepted |
| [0003](0003-same-origin-cloudfront-proxy.md) | Use a same-origin CloudFront `/api/*` proxy | Accepted |
| [0004](0004-presigned-s3-media.md) | Use presigned S3 for media | Accepted |
| [0005](0005-dynamodb-single-table-on-demand.md) | Use DynamoDB single table, on-demand | Accepted |
| [0006](0006-custom-cognito-forms-auto-confirm.md) | Use custom Cognito forms with auto-confirm | Accepted |
| [0007](0007-stripe-webhook-execute-api-url.md) | Use the execute-api URL for the Stripe webhook | Accepted |
| [0008](0008-cost-guardrails.md) | Cost guardrails and AI caps | Accepted |
| [0009](0009-diagram-tooling.md) | Diagram tooling: living Mermaid views + polished PlantUML snapshot | Superseded by 0010 |
| [0010](0010-d2-standard-drop-plantuml.md) | Standardize on D2 for diagrams, drop PlantUML | Accepted |

## Template

```md
# ADR-NNNN: Title

- Status: Proposed
- Date: YYYY-MM-DD
- Deciders: Tom

## Context

What is the problem? What forces are at play (cost, security, operability, team skills, deadlines)?

## Options Considered

1. **Option A** — pros/cons.
2. **Option B** — pros/cons.
3. **Option C** — pros/cons.

## Decision

What we chose and why.

## Consequences

- Positive: ...
- Negative: ...
- Follow-ups: ...
```

## Notes

- Keep each ADR to roughly one page.
- Link related ADRs and the architecture document.
- Record alternatives even when the choice seems obvious; that is the value of the record.
