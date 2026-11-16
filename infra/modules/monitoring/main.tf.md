# `main.tf` — Monitoring module (SNS, budget, alarms)

**Purpose:** Central observability and cost guardrails: one SNS topic, email subscription, monthly budget, AI-spend alarms, and platform alarms.

## Resources

| Resource | Role |
|---|---|
| `aws_sns_topic.alerts` | Single notification topic. |
| `aws_iam_policy_document.alerts_topic` + `aws_sns_topic_policy.alerts` | Topic policy: account owner, CloudWatch publish, Budgets publish (pinned to this account/budget). |
| `aws_sns_topic_subscription.email` | Emails notifications to `var.alert_email` (private config, placeholder in repo). |
| `aws_budgets_budget.monthly` | $25/month budget with $1/$5/$10/$25 ACTUAL thresholds. |
| `aws_cloudwatch_metric_alarm` (AI) | Daily `GenerationCount` and `EstimatedAICost` alarms. |
| `aws_cloudwatch_metric_alarm` (platform) | API 5xx, Lambda errors/throttles, DynamoDB throttles, handled generation failures. |

## Teaching notes

- **A custom topic policy replaces the default.** Adding statements for CloudWatch and Budgets is required; without them, those services cannot publish. Conditions (`aws:SourceAccount`, `aws:SourceArn`) prevent confused-deputy access.
- **Alarm conventions:** 5-minute `Sum >= 1`, `treat_missing_data = notBreaching`. Low dev traffic therefore does not page on missing data.
- **Handled failures are not Lambda errors.** The worker marks jobs failed and returns success, so `AWS/Lambda Errors` stays flat; the EMF `GenerationFailures` metric is what alarm on.
- **Cost Anomaly Detection is deliberately absent.** The account already has a Dimensional services monitor and the quota rejects a second one. The budget remains the primary guardrail; the comment records the reason.
- **Thresholds are percentages of $25:** 4%=$1, 20%=$5, 40%=$10, 100%=$25.

## Safe changes

- Change thresholds via variables, not hardcoded numbers.
- Adding an alarm: use the same 5-minute/notBreaching convention and add its name to `outputs.tf`.
- Do not publish secrets or PII into alarm descriptions.

## Related

- `docs/PLAN.md` §7.6, ADR-0008
- `docs/RUNBOOK.md` — alarm → response mapping
- `apps/api/src/lib/metrics.ts` — EMF namespace/dimensions
