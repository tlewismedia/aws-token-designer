# Runbook

Operational procedures for AWS Token Designer: what each alarm means, how to
stop AI spend, how to deploy and roll back, and the routine checks. Commands
use `$STAGE` (`dev` or `prod`) and `$REGION` (`us-west-2`).

> This is a demo service with a single operator. "On-call" below means the
> person watching the production alerts. Never paste secrets, real account IDs,
> or personal email addresses into commits or public issues.

## Alert routing

All alarms and the monthly budget publish to the SNS topic
`token-designer-<stage>-alerts`, which emails `alert_email` (a placeholder in
the repo; the real address is passed at apply time). Confirm the subscription
once per environment from the email SNS sends after apply.

| Alarm | Namespace / metric | What it means |
|---|---|---|
| `token-designer-<stage>-api-5xx` | `AWS/ApiGateway` `5xx`, `ApiId`+`Stage=api`, Sum ≥ 1 / 5 min | API Gateway itself is returning server errors (bad integration, Lambda crash, timeout). The HTTP API stage is literally `api`. |
| `token-designer-<stage>-api-lambda-errors` | `AWS/Lambda` `Errors`, `FunctionName=…-api` | The API Lambda threw (unhandled exception, SDK/network failure). |
| `token-designer-<stage>-worker-lambda-errors` | `AWS/Lambda` `Errors`, `FunctionName=…-generate-worker` | The worker **crashed** (unhandled exception, timeout). Handled failures do not increment this — see `generation-failures`. |
| `token-designer-<stage>-api-lambda-throttles` | `AWS/Lambda` `Throttles`, `FunctionName=…-api` | API concurrency exceeded; callers saw 429/5xx. |
| `token-designer-<stage>-worker-lambda-throttles` | `AWS/Lambda` `Throttles`, `FunctionName=…-generate-worker` | Generation concurrency exceeded; async retries will run. |
| `token-designer-<stage>-dynamodb-read-throttle-events` | `AWS/DynamoDB` `ReadThrottleEvents`, `TableName` | Reads exceeded capacity (unexpected for on-demand; investigate a hot partition). |
| `token-designer-<stage>-dynamodb-write-throttle-events` | `AWS/DynamoDB` `WriteThrottleEvents`, `TableName` | Writes exceeded capacity (same triage). |
| `token-designer-<stage>-generation-failures` | `TokenDesigner` `GenerationFailures`, `Stage`, Sum ≥ 1 / 5 min | A **handled** generation failure (kill switch, missing key, Stability non-2xx, sharp/S3/DDB) marked a job failed and returned success. Lambda `Errors` stays flat. |
| `token-designer-<stage>-generation-count-daily` | `TokenDesigner` `GenerationCount`, Sum > 50 / day | Volume spike or abuse; check the cap and per-user counts. |
| `token-designer-<stage>-estimated-ai-cost-daily` | `TokenDesigner` `EstimatedAICost`, Sum > $5 / day | AI spend is running ahead of the guardrail; consider the kill switch. |
| Budget `token-designer-<stage>-monthly` | AWS Budgets (actual spend) | $1/$5/$10/$25 thresholds on a $25/month budget; the topic policy grants Budgets publish. |

All platform alarms use `period = 300`, one evaluation, threshold 1, and
`treat_missing_data = notBreaching`, so a quiet dev stage does not page.

## First response

1. **Acknowledge** the SNS email (reply/star it) so the team knows it is being
   handled.
2. **Identify** the stage and alarm name from the email subject.
3. **Triage** with the matching section below.
4. **Record** the incident (see "Incident logging") even if it self-resolves.
5. **Communicate** status in the incident issue; do not post secrets or user
   data.

If the alarm is about AI spend or runaway generation, **disable generation
first** (next section) and investigate afterwards.

## Kill switch (generation)

The worker reads `/token-designer/<stage>/generation-enabled` before calling
Stability. Anything other than `true` (or a missing parameter) fails closed with
job error `GENERATION_DISABLED`; the API still returns `202`, and the client
shows a safe message.

```sh
# OFF (stop all new Stability calls)
aws ssm put-parameter \
  --name "/token-designer/${STAGE}/generation-enabled" \
  --type String --value "false" --overwrite --region "${REGION}"

# ON (restore normal generation)
aws ssm put-parameter \
  --name "/token-designer/${STAGE}/generation-enabled" \
  --type String --value "true" --overwrite --region "${REGION}"
```

Verify the switch:

```sh
aws ssm get-parameter --name "/token-designer/${STAGE}/generation-enabled" \
  --region "${REGION}" --query 'Parameter.Value' --output text
```

A warm Lambda may cache the old value briefly; a new invocation picks it up.
Confirm with a test generation (expect `failed` / `GENERATION_DISABLED` when
off).

## Adjusting the daily cap

The per-user cap is compile-time (`DAILY_GENERATION_CAP` in
`packages/shared/src/constants.ts`, currently 20). To change it:

1. Edit the constant and open a PR (the value is shared by the API and the
   client).
2. Merge, rebuild the API bundle (`./scripts/build-lambda.sh`), and apply the
   `lambda` module.
3. Confirm the new behaviour with the 21st-generation test in
   `docs/TESTING.md`.

The alarm threshold (`daily_generation_alarm_threshold`, default 50) is a
Terraform variable in the monitoring module; changing it is a normal
`terraform apply` of the env with a reviewed plan.

## Alarm-specific triage

### API 5xx / api Lambda errors

1. Check recent logs:
   ```sh
   aws logs tail "/aws/lambda/token-designer-${STAGE}-api" --since 30m \
     --region "${REGION}" --format short
   ```
2. Check the API Gateway access log group
   `/aws/apigateway/token-designer-<stage>-api` for routes/statuses.
3. Healthy probe: `curl -i "$WEB/api/health"` should be 200.
4. If the error is a bad deploy, roll back (below). If it is a dependency
   outage (Cognito/DynamoDB/S3), record it and wait for AWS; the retries are
   idempotent.

### Worker Lambda errors (crashes only)

`worker-lambda-errors` only catches unhandled crashes/timeouts. The worker
handles normal failures (kill switch, missing key, Stability non-2xx,
sharp/S3/DDB) by marking the job failed and returning success, so those appear
as `generation-failures` instead.

1. `aws logs tail "/aws/lambda/token-designer-${STAGE}-generate-worker" --since 1h --region "$REGION"`.
2. Look for `GENERATION_FAILED`, `GENERATION_DISABLED`, timeout, or `sharp`
   errors.
3. If Stability is failing and cost is a concern, flip the kill switch off.
4. Failed jobs are safe to retry by submitting again; images are only created
   by the first `pending → processing` transition.

### Generation failures (handled)

1. The `GenerationFailures` metric is emitted by every handled failure path,
   with a non-metric `FailureCode` property in the same EMF line
   (`GENERATION_DISABLED` or `GENERATION_FAILED`).
2. `aws logs tail "/aws/lambda/token-designer-${STAGE}-generate-worker" --since 30m --region "$REGION"`:
   look for `generation disabled by kill switch`, `stability key unavailable`,
   `stability request failed`, or `generation processing failed`.
3. If the cause is cost/abuse, turn the kill switch off. If it is a transient
   Stability/provider failure, jobs can be resubmitted manually.
4. If `GENERATION_DISABLED` fires unexpectedly, check
   `/token-designer/<stage>/generation-enabled` (see "Kill switch").
5. If `sharp`/S3/DDB failures recur, inspect the safe error code and roll back
   the Lambda if a deploy introduced the problem.

### Throttles (Lambda)

1. `aws cloudwatch get-metric-statistics` for `Throttles` on the function to
   confirm volume.
2. The account concurrency limit is 10 and both functions are unreserved; a
   spike can throttle. The async worker retries, and API Gateway throttling
   protects the API. If sustained, raise the account quota and then set
   `reserved_concurrency` (PLAN §7.6: API 10, worker 5).
3. Check for a runaway client loop; the daily cap bounds generation.

### DynamoDB throttle events

On-demand tables rarely throttle. `ReadThrottleEvents`/`WriteThrottleEvents`
are table-level metrics (dimension `TableName` only), so the alarms watch the
two signals directly. Check for a hot partition (one user doing a tight loop)
and recent deploys. The SDK retries transient errors; persistent throttles mean
a design issue or an account-level limit — record it and escalate.

### Generation count / AI cost daily

1. Confirm the metric in CloudWatch (`TokenDesigner`, dimension `Stage`).
2. Inspect today's `RATE#<yyyy-mm-dd>` items or query by `SK` prefix for the
   busiest users.
3. If unexpected, turn the kill switch **off** and investigate the caller.
4. The cap is per user, so a single account cannot exceed 20/day; many accounts
   or a shared account are the usual causes.

### Budget threshold

1. Open Billing → Budgets → `token-designer-<stage>-monthly`.
2. Use Cost Explorer grouped by service to find the delta.
3. At $25 (100%), treat as an incident: disable generation if AI is implicated,
   then review for out-of-Terraform resources (NAT, EC2, provisioned
   concurrency).
4. Record the finding and any follow-up issue.

## Deployment

```sh
# 1. Lambda bundles + sharp layer (Terraform zips them; they must exist first)
./scripts/build-lambda.sh
./scripts/build-sharp-layer.sh   # requires Docker; arm64

# 2. Infrastructure (review the plan first)
terraform -chdir=infra/envs/${STAGE} init -backend-config=backend.hcl
terraform -chdir=infra/envs/${STAGE} plan -out=tfplan
terraform -chdir=infra/envs/${STAGE} apply tfplan

# 3. SPA
./scripts/deploy-web.sh ${STAGE}  # dev by default; prod supported
```

`deploy-web.sh` reads the env outputs, builds the SPA with the public Cognito
config, syncs to the web bucket, and invalidates only `/index.html`.

## Rollback

Pick the smallest rollback that fixes the problem. Preserve evidence (logs,
commit SHAs) before changing anything.

### Roll back the web SPA (fastest, no Lambda/infra change)

```sh
# Go back to the last known-good commit that produced the deployed build.
git checkout <known-good-sha>
./scripts/deploy-web.sh ${STAGE}
git checkout -          # return to the working branch

# Verify
WEB=$(terraform -chdir=infra/envs/${STAGE} output -raw web_url)
curl -sI "$WEB/" | head
curl -sI "$WEB/api/health"
```

### Roll back the API/worker Lambda (code only)

Terraform tracks `source_code_hash`. Rebuild the previous commit and apply the
`lambda` module:

```sh
git checkout <known-good-sha>
./scripts/build-lambda.sh
terraform -chdir=infra/envs/${STAGE} apply \
  -target=module.lambda.aws_lambda_function.api \
  -target=module.lambda.aws_lambda_function.worker
git checkout -

# Verify
curl -i "$(terraform -chdir=infra/envs/${STAGE} output -raw web_url)/api/health"
```

If you keep versioned artifacts, `aws lambda update-function-code
--function-name token-designer-<stage>-api --zip-file fileb://previous.zip` is
an equivalent emergency path; Terraform will restore the configured bundle on
the next apply.

### Roll back infrastructure

```sh
git revert <bad-commit>            # or git checkout the previous tag
terraform -chdir=infra/envs/${STAGE} plan -out=rollback.tfplan
# Review carefully: prod stateful resources use deletion protection, so a plan
# that would destroy a table/bucket/user pool must be rejected, not applied.
terraform -chdir=infra/envs/${STAGE} apply rollback.tfplan
```

Caveats:

- `prevent_destroy`/deletion protection is intentional. If a rollback needs to
  replace a stateful resource, stop and get a second review; prefer a forward
  fix.
- CloudFront deploys take several minutes; `wait_for_deployment` makes apply
  wait.
- Never hand-edit state; inspect with `terraform state list/show`.

### Rollback drill (dev)

Run quarterly (and after changing deploy tooling):

```sh
# 0. Record the current deploy commit.
CURRENT=$(git rev-parse --short HEAD)
PREV=$(git rev-parse --short HEAD~1)

# 1. Deploy the previous build to dev.
git checkout "$PREV"
./scripts/deploy-web.sh dev
WEB=$(terraform -chdir=infra/envs/dev output -raw web_url)
curl -sI "$WEB/" | head -5

# 2. Return to the current build and redeploy.
git checkout "$CURRENT"
./scripts/deploy-web.sh dev

# 3. Smoke test (login → upload → add → print) per docs/TESTING.md.
```

The drill is successful when both deploys return 200, the SPA loads, and
`$WEB/api/health` is 200 on each build.

## Alarm drill

Use the dimension-accurate `put-metric-data` triggers in
[`docs/TESTING.md`](TESTING.md#alarm-and-budget-drill-phase-6) first, then
`set-alarm-state` only to confirm SNS routing. Publishing a real datapoint is
what proves the alarm's dimensions (ApiId + `Stage=api`, FunctionName,
TableName, TokenDesigner/Stage) match CloudWatch.

Demonstrate that every alarm reaches SNS without waiting for a real incident by
setting each alarm state directly (CloudWatch sends the alarm action on the
`ALARM` transition):

```sh
for name in \
  api-5xx api-lambda-errors worker-lambda-errors \
  api-lambda-throttles worker-lambda-throttles \
  dynamodb-read-throttle-events dynamodb-write-throttle-events \
  generation-failures generation-count-daily estimated-ai-cost-daily; do
    alarm="token-designer-${STAGE}-${name}"
    aws cloudwatch set-alarm-state --alarm-name "$alarm" \
      --state-value ALARM --state-reason "drill $(date -u +%FT%TZ)" \
      --region "${REGION}"
    sleep 2
    aws cloudwatch set-alarm-state --alarm-name "$alarm" \
      --state-value OK --state-reason "drill complete" \
      --region "${REGION}"
  done
```

For each alarm confirm the SNS email arrives. The monthly budget cannot be
forced with `set-alarm-state`; verify delivery by lowering the limit/threshold
temporarily in the Budgets console (or `aws budgets update-budget`), waiting
for the next evaluation, then restoring it. The SNS topic policy grants
`budgets.amazonaws.com` publish (scoped to this account and budget), so the
budget notification should reach the same email subscription; if it does not,
check the topic policy and the subscription's confirmation state first. Record
the drill date and each alarm's result in the incident log.

## Incident logging

1. Open a GitHub issue titled `[incident] <date> <short summary>` (no secrets,
   no account IDs, no personal emails).
2. Include: stage, alarm name(s), start/end time (UTC), customer impact, what
   you did, and links to relevant commits.
3. Add a row to the Issues table in [`docs/RAID.md`](RAID.md).
4. Close the issue when the fix is deployed and verified; link the fix PR.

## On-call basics

- **Severity:** AI-cost/generation runaway or full outage = act immediately.
  Single 5xx or a one-off throttle = acknowledge and investigate during the next
  working block. Budget thresholds below $10 = informational.
- **Do not** disable the kill switch while investigating a cost alarm until the
  cause is understood.
- **Escalation:** the repository owner. For AWS account-level issues, use the
  AWS Support path configured for the account (not documented here).
- **Access:** AWS credentials come from the operator's CLI profile; there are no
  long-lived keys in the repo. GitHub Actions uses OIDC when the optional plan
  job is enabled.

## Daily checks (2 minutes)

```sh
# Alarm state across the stage.
aws cloudwatch describe-alarms --region "${REGION}" \
  --alarm-name-prefix "token-designer-${STAGE}" \
  --query 'MetricAlarms[].[AlarmName,StateValue]' --output table

# Recent worker errors.
aws logs tail "/aws/lambda/token-designer-${STAGE}-generate-worker" \
  --since 24h --region "${REGION}" --format short | grep -i error | tail

# Kill switch is still on (unless intentionally off).
aws ssm get-parameter --name "/token-designer/${STAGE}/generation-enabled" \
  --region "${REGION}" --query 'Parameter.Value' --output text
```

## Weekly checks (15 minutes)

- Review Dependabot PRs; run `npm audit --omit=dev`.
- Review Cost Explorer for the week and the budget forecast.
- Scan API 5xx and Lambda error rates (`AWS/Lambda`, `AWS/ApiGateway`).
- Check DynamoDB `ReadThrottleEvents`/`WriteThrottleEvents` and consumed capacity.
- Confirm CloudWatch Logs retention is still 7d dev / 30d prod.
- Confirm state bucket versioning and that no plan/state files are in git.
- Re-read `docs/RAID.md`; update mitigations and open issues.

## Related

- [`docs/TESTING.md`](TESTING.md) — alert drill commands, smoke tests, rollback
  drill.
- [`docs/COSTS.md`](COSTS.md) — budget thresholds and spend checks.
- [`docs/SECURITY.md`](SECURITY.md) — incident/security response.
- [`docs/TERRAFORM.md`](TERRAFORM.md) — environments, state, and
  `prevent_destroy`.
