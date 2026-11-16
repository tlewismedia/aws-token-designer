# Infrastructure — guided tour

This folder is the Terraform source for AWS Token Designer. Every hand-written
`.tf` file has a sibling **`<file>.tf.md`** that explains what it does, why it
exists, and what to watch out for. Start here, then open the sibling doc for a
file you are changing.

## Layout

```
infra/
  bootstrap/          # creates the S3 state bucket — apply this first
  envs/
    dev/              # dev stack (destroyable)
    prod/             # prod stack (stateful resources protected)
  modules/
    api/              # API Gateway HTTP API + JWT authorizer + routes
    cloudfront/       # same-origin SPA + /api/* proxy
    cognito/          # user pool, SPA client, pre-sign-up auto-confirm
    dynamodb/         # single table + byId GSI
    lambda/           # api + generateWorker, IAM, sharp layer
    monitoring/       # SNS, budget, alarms
    storage/          # web + media S3 buckets
```

## Apply order

1. **Bootstrap once** (creates the state bucket):
   ```bash
   terraform -chdir=infra/bootstrap init
   terraform -chdir=infra/bootstrap apply -var="state_bucket_name=<unique-name>"
   ```
2. **Configure the env backend** (gitignored):
   ```bash
   cp infra/envs/dev/backend.hcl.example infra/envs/dev/backend.hcl
   # fill in bucket/key/region from the bootstrap output
   ```
3. **Build Lambda artifacts** (the `lambda` module zips them at plan time):
   ```bash
   ./scripts/build-lambda.sh
   ./scripts/build-sharp-layer.sh
   ```
4. **Apply the environment**:
   ```bash
   terraform -chdir=infra/envs/dev init -backend-config=backend.hcl
   terraform -chdir=infra/envs/dev plan
   terraform -chdir=infra/envs/dev apply
   ```

Prod follows the same pattern with `infra/envs/prod` and `stage = "prod"`.

## Generated files (intentionally not documented)

These are produced by Terraform or tooling, not hand-written:

- `.terraform/` — provider/module working directories and generated zips
- `.terraform.lock.hcl` — generated provider lockfile (normally committed)
- `*.tfstate`, `*.tfstate.*` — remote state is in S3; local copies are artifacts
- `*.tfplan` — saved plans
- `backend.hcl` — local backend config (gitignored; `backend.hcl.example` is the template)
- `apps/api/dist/*` — Lambda bundles and the sharp layer built by scripts

If you need to understand a generated file, read the script or Terraform command
that produced it — there is no sibling doc for generated output by design.

## Key ideas used throughout

- **Root modules vs child modules:** `envs/*` and `bootstrap` are roots you run.
  `modules/*` are reusable building blocks called by roots.
- **State:** remote S3 + native lockfile; never commit state or `backend.hcl`.
- **Secrets:** SSM SecureString, created out-of-band. Terraform stores parameter
  **names**, never values. See `docs/TERRAFORM.md`.
- **Same-origin CloudFront:** the SPA and `/api/*` share one domain, so there is
  no CORS and no absolute API URL. See ADR-0003.
- **Production guardrails:** `prevent_destroy` where the resource supports it;
  bucket-policy Deny statements where S3 does not.

## Source of truth

The `.tf` files are authoritative. The `.tf.md` docs are teaching aids; if they
disagree after a refactor, update the doc in the same PR.
