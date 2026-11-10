# ADR-0008: Cost Guardrails and AI Caps

- Status: Accepted
- Date: 2026-11-09
- Deciders: Tom

## Context

The app is a demo with low traffic, but AI generation and accidental abuse can create unpredictable external spend. AWS costs should stay near zero.

## Options Considered

1. **No guardrails** — simplest, but risks runaway AI or AWS costs.
2. **Budgets and alerts only** — visibility, but no hard limits.
3. **Budgets + anomaly detection + daily cap + kill switch + reserved concurrency + throttling** — layered protection with modest operational overhead.

## Decision

Adopt option 3:

- AWS Budgets at $1 / $5 / $10 / $25 and Cost Anomaly Detection, alerting a private email.
- Per-user daily generation cap (default 20/day).
- SSM `generation-enabled` kill switch checked by the worker.
- `GenerationCount` / `EstimatedAICost` CloudWatch metrics and alarms.
- Lambda reserved concurrency (API 10, worker 5).
- API Gateway throttling (10 rps, burst 20).
- CloudWatch log retention (7 days dev, 30 days prod).

## Consequences

- Positive: protects against abuse and runaway spend; gives visibility into external AI cost.
- Negative: some operational overhead; caps may need tuning as traffic grows.
- Follow-ups: review budgets monthly; document the runbook for alerts and kill-switch use.
