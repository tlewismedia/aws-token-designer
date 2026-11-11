# Costs and Guardrails

What AWS Token Designer costs at demo traffic, which guardrails exist, and how
to check spend. Figures are list prices in `us-west-2` for a low-traffic demo
(tens of users, thousands of requests/month). They are estimates, not a bill.

> **Excluded from all tables:** Stability AI image generation (~$0.03–0.08 per
> ultra image), Stripe fees (2.9% + $0.30 per successful charge), and any
> custom domain (not used in v1).

## Monthly estimate by service

| Service | Assumption | Estimated monthly |
|---|---|---|
| Lambda (`api` + `generateWorker`) | ~50k requests, 1024 MB, ~1 s, mostly free tier | $0.00–0.20 |
| API Gateway (HTTP API) | ~50k requests | $0.00–0.05 |
| DynamoDB (on-demand) | < 1M reads + writes, < 1 GB | $0.00–0.50 |
| S3 (web + media) | ~1 GB stored, ~20k GET/PUT | $0.00–0.10 |
| CloudFront | ~5 GB transfer, ~100k requests, `PriceClass_100` | $0.00–0.50 |
| Cognito (Essentials) | < 10k MAU | $0.00 |
| CloudWatch Logs | < 5 GB/month, 7-day (dev) / 30-day (prod) retention | $0.00–0.50 |
| CloudWatch alarms | 10 alarms | $0.00–0.10 |
| SNS (email) | a handful of alert emails | ~$0.00 |
| AWS Budgets / Cost Explorer | 1 budget + API calls | ~$0.00 |
| SSM Parameter Store | 4 standard parameters per env | $0.00 |
| **AWS total** | | **~$0–2/month** |

Free-tier caveats: API Gateway's 12-month free tier and Lambda's always-free
tier are account-wide; a busy account can consume them elsewhere. The budget
and alarms remain the backstop either way.

## Guardrails

| Guardrail | Where | Behaviour |
|---|---|---|
| Monthly cost budget | `infra/modules/monitoring` (`aws_budgets_budget.monthly`) | $25 limit with alerts at 4% ($1), 20% ($5), 40% ($10), and 100% ($25) of actual spend, published to the alerts SNS topic. |
| SNS email subscription | `infra/modules/monitoring` | Budget and alarm notifications go to `alert_email` (placeholder in the repo; the real address is passed at apply time). |
| Cost Anomaly Detection | AWS account, not Terraform | This account already runs a DIMENSIONAL `Default-Services-Monitor`. The account quota rejects a second monitor, so Terraform does not manage one (see the comment in the monitoring module). The budget is the primary guardrail. Revisit if the quota is raised. |
| Daily generation cap | API + `RATE#<date>` item | 20 generations per user per UTC day; the 21st returns `429 RATE_LIMITED`. |
| Daily generation-count alarm | `token-designer-<stage>-generation-count-daily` | Fires above 50 generations in a UTC day (2.5× the per-user cap). |
| Daily AI-cost alarm | `token-designer-<stage>-estimated-ai-cost-daily` | Fires above $5 estimated Stability spend in a UTC day (EMF metric `EstimatedAICost`). |
| Kill switch | SSM `/token-designer/<stage>/generation-enabled` | Anything other than `true` (or a missing parameter) fails generation closed before Stability is called. |
| API throttling | `infra/modules/api` | 10 requests/s, burst 20 per route/stage. |
| Log retention | `infra/modules/lambda`, `infra/modules/api`, `infra/modules/cognito` (pre-sign-up) | 7 days in dev, 30 days in prod (CAP/PLAN §7.6). |
| S3 lifecycle | `infra/modules/storage` | Abort incomplete multipart uploads after 1 day. |
| No provisioned concurrency | Lambda modules | Cold starts accepted; no always-on cost. |
| Single NAT-free VPC design | None (Lambda outside a VPC) | No NAT Gateway hourly/data charges. |

## How to check spend

1. **AWS Budgets console** — Billing → Budgets → `token-designer-<stage>-monthly`.
   Shows actual vs forecast against the $25 limit.
2. **Cost Explorer** — group by Service, filter tag `Project=token-designer`:

   ```sh
   aws ce get-cost-and-usage \
     --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
     --granularity DAILY \
     --metrics UnblendedCost \
     --group-by Type=DIMENSION,Key=SERVICE \
     --region us-east-1
   ```

   (Cost Explorer is a global service in `us-east-1`.)
3. **Budget status via CLI**:

   ```sh
   aws budgets describe-budget \
     --account-id "$(aws sts get-caller-identity --query Account --output text)" \
     --budget-name token-designer-dev-monthly
   ```
4. **CloudWatch alarms** — `aws cloudwatch describe-alarms` filtered to
   `token-designer-<stage>`; see the runbook for responses.

## What to do when the budget alerts

- At the 4%/20% thresholds ($1/$5): informational for a demo. Check for a
  runaway generation loop (generation-count alarm) or unexpected traffic.
- At 40% ($10): review Cost Explorer by service; confirm no idle NAT/EC2 or
  provisioned concurrency was created outside Terraform.
- At 100% ($25): treat as an incident. Disable generation first (runbook "kill
  switch"), then investigate the service with the largest delta.

## Reducing cost further

- Set `daily_generation_alarm_threshold` / `daily_ai_cost_alarm_threshold_usd`
  lower if the demo is quiet.
- Lower Lambda memory (1024 MB) only after checking p95 latency; keep the
  `sharp` layer compatible.
- Delete `dev` when it is not in use (prod buckets/table/user pool are
  protected by native deletion protection and S3 bucket policies; dev has no
  such guards and can be torn down).

## Related

- [`docs/PLAN.md`](PLAN.md) §7.6 (monitoring) and §7.8 (cost estimate)
- [`docs/RUNBOOK.md`](RUNBOOK.md) (alert response and kill switch)
- [`docs/TERRAFORM.md`](TERRAFORM.md) (budget/alarm wiring)
- ADR-0008 (cost guardrails)
