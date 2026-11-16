# `variables.tf` — Monitoring inputs

**Purpose:** Define who gets paged, the AI thresholds, and the resource dimensions for platform alarms.

## Inputs

| Name | Default | Meaning |
|---|---|---|
| `project`, `stage`, `tags` | — | Naming/tagging. |
| `alert_email` | `alerts@example.com` | Real address is private config. |
| `generation_metric_namespace` | `TokenDesigner` | Must match the worker’s EMF namespace. |
| `daily_generation_alarm_threshold` | `50` | Daily generation count alarm (2.5× the 20/user cap). |
| `daily_ai_cost_alarm_threshold_usd` | `5` | Estimated AI spend alarm. |
| `api_id`, `api_stage_name` | — / `api` | API Gateway alarm dimensions. |
| `api_lambda_name`, `worker_lambda_name` | — | Lambda alarm dimensions. |
| `table_name` | — | DynamoDB alarm dimension. |

## Teaching notes

- **Metric namespace/dimensions must match exactly.** CloudWatch alarms are keyed by namespace + metric name + dimensions; a typo silently produces an always-`notBreaching` alarm.
- **Stage dimension is `api`**, not the environment name. It is the API Gateway stage, which is literally `api` in both dev and prod.
- **Thresholds are variables** so prod can tune without editing resources.
- **Email is a placeholder** in the public repo; override at apply time.

## Related

- `main.tf`
- `apps/api/src/lib/metrics.ts`
- `docs/PLAN.md` §7.6
