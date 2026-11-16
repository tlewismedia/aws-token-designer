# `main.tf` — Lambda module (api + generateWorker)

**Purpose:** Build and deploy the two backend Lambdas, their IAM roles, log groups, environment variables, and the shared `sharp` layer.

## Resources

| Resource | Role |
|---|---|
| `data.archive_file.api` | Zips `apps/api/dist/index.mjs`. |
| `data.archive_file.worker` | Zips `apps/api/dist/generation.mjs`. |
| `data.archive_file.sharp_layer` | Zips the Docker-built arm64 sharp layer. |
| `aws_iam_role.api` / `aws_iam_role.worker` | Execution roles. |
| `aws_iam_role_policy.api` / `.worker` | Least-privilege policies (logs, table, media bucket, SSM, KMS decrypt, worker invoke). |
| `aws_lambda_function.api` | Router + upload processing; 30s, 1024 MB, arm64. |
| `aws_lambda_function.worker` | Async Stability generation; 120s, 1024 MB, arm64, handler `generation.handler`. |
| `aws_cloudwatch_log_group.*` | Retention-controlled logs. |
| `aws_lambda_layer_version.sharp` | Shared sharp layer for both functions. |

## Key design notes

- **Two functions, one job each:** `api` handles requests; `worker` does slow AI work. The worker is invoked asynchronously, so the API returns `202 { jobId }` fast.
- **sharp is a layer, not bundled:** native binaries are platform-specific. The layer is built for Linux arm64 by `scripts/build-sharp-layer.sh`.
- **Least privilege:** the API role can invoke only the worker; the worker cannot invoke anything; both can touch only this table and media bucket.
- **SSM names in env, values from SSM:** the roles get `ssm:GetParameter` only on the two parameter ARNs, plus `kms:Decrypt` on the AWS-managed `aws/ssm` key.
- **Log group before function:** `depends_on` avoids Lambda auto-creating an unbounded-retention log group.
- **Reserved concurrency is `-1` in dev:** the account limit is too low to reserve. Prod can raise it after a quota increase.
- **ESM handler:** the worker bundle is `generation.mjs`, so the handler is `generation.handler` — not `index.handler`.

## Safe changes

- Changing memory/timeout affects cold starts and AI latency; test in dev.
- Do not add broad IAM actions; extend the specific resource lists.
- Do not bundle sharp into the zip; it will not run on Lambda.

## Related

- `scripts/build-lambda.sh`, `scripts/build-sharp-layer.sh`
- `apps/api/src/index.ts`, `apps/api/src/generation.ts`
- ADR-0008, `docs/PLAN.md` §6.7/§7.3
