# `outputs.tf` — DynamoDB outputs

**Purpose:** Expose the table identity to the API/Lambda modules and alarms.

## Outputs

| Output | Consumer |
|---|---|
| `table_name` | Lambda env `TABLE_NAME`; CloudWatch DynamoDB alarm dimension. |
| `table_arn` | IAM policies (API and worker roles). |

## Teaching notes

- The ARN is used for least-privilege IAM. The module never grants `dynamodb:*` on `*`.
- The name is what application code uses; the ARN is what IAM uses.
- Keep outputs minimal: only what other modules genuinely need.

## Related

- `infra/modules/lambda` (IAM + env)
- `infra/modules/monitoring` (TableName dimension)
