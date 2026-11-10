# ADR-0005: Use DynamoDB Single Table, On-Demand

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

Entities are profiles, images, sheets, payments, jobs, and daily rate limits. Traffic is low (demo), access patterns are simple, and the app is greenfield.

## Options Considered

1. **DynamoDB single table, on-demand** — cheap, low-ops, no joins; requires designing access patterns and keys.
2. **Multiple DynamoDB tables** — clearer separation, but more Terraform resources and IAM permissions.
3. **RDS/Aurora** — relational, but not free-tier friendly and operationally heavier than needed.

## Decision

Use a **single DynamoDB table** with `USER#<sub>` partitions, ULID sort keys, on-demand capacity, and TTL for jobs and rate-limit items.

## Consequences

- Positive: minimal cost and operations; fast point lookups and ordered queries; no capacity planning.
- Negative: access patterns must be designed up front; no ad-hoc joins; no GSI initially.
- Follow-ups: document access patterns; add a GSI only if admin/email lookup is needed; keep PITR off for the demo.
