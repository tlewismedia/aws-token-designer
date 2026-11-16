# `outputs.tf` — Monitoring outputs

**Purpose:** Expose the notification topic, budget, and the full alarm list.

## Outputs

| Output | Consumer |
|---|---|
| `alerts_topic_arn` | Env outputs, runbook, other modules that need to publish. |
| `alerts_topic_policy_json` | Debugging/audit of publish permissions. |
| `budget_name` | Verification and runbook. |
| `alarm_names` | Runbook / verification: every alarm managed by this module. |

## Teaching notes

- `alarm_names` is intentionally a list: it is the checklist for “did all alarms deploy?” and the index for the runbook.
- Outputs do not include the email address; that is configuration, not an exported artifact.
- If you add an alarm, add it here so verification stays complete.

## Related

- `main.tf`
- `docs/RUNBOOK.md`
