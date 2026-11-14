# Public Repository Policy

**Status:** Active
**Applies to:** `aws-token-designer`

This repository may be public. Assume anyone can read it. **Security must not depend on secrecy.** This checklist defines what is safe to publish and what must stay private.

---

## Safe to Publish

- Architecture docs, C4/context/container/deployment diagrams.
- ADRs and decision rationale.
- Application code, Terraform modules, tests, scripts.
- Cost estimates and guardrail strategy.
- High-level security posture and controls matrix.
- Runbooks without secrets or account-specific details.
- Requirements, RAID log, testing strategy.

---

## Never Commit

Even in a private repo:

- `.env`, API keys, Stripe secret/webhook secret, Stability API key.
- Firebase service-account JSON, private keys, certificates.
- Terraform state (`*.tfstate*`), `.terraform/`, plan output.
- `*.tfvars` containing secrets.
- Customer data or real user data.

Use **SSM SecureString**, **GitHub Secrets**, or a private `terraform.tfvars` that is gitignored.

---

## Redact / Placeholder in Public Docs

- AWS account ID and exact ARNs/resource IDs.
- Personal email addresses — use `alerts@example.com`; keep the real alert address in private config.
- Internal hostnames, IPs, private endpoints.
- Exact billing figures if they reveal business scale.
- Detailed threat models / known weaknesses — publish a high-level controls matrix; keep attack-path detail private.
- Screenshots containing emails, tokens, or user data.

---

## Repo Hardening

- [x] `.gitignore` covers `.env*`, `.terraform/`, `*.tfstate*`, `*.tfvars` with secrets, `*.pem`. (`cdk.out/` is not used by this repo.)
- [ ] Run `gitleaks` / `trufflehog` before the first push. — gitleaks runs in the lefthook pre-commit hook (skipped with a warning if not installed); GitHub secret scanning and push protection are enabled server-side.
- [ ] GitHub secret scanning enabled. — Repository setting; enable in the GitHub UI.
- [x] Dependabot or Renovate enabled. — `.github/dependabot.yml` covers npm and GitHub Actions weekly.
- [ ] CodeQL enabled (free for public repos). — Optional repository setting.
- [ ] Branch protection: PR reviews and required status checks. — Repository setting.
- [x] `SECURITY.md` with a vulnerability disclosure policy. — Root `SECURITY.md`.
- [ ] `LICENSE` chosen (MIT/Apache-2.0, or restrictive/private if protecting the business idea). — README says TBD.
- [x] `CONTRIBUTING.md`, `CODEOWNERS`.
- [x] GitHub Actions uses OIDC, not long-lived AWS keys. — The optional Terraform plan and E2E jobs assume roles via `configure-aws-credentials`; the required jobs use no AWS credentials.
- [ ] OIDC role trust policy restricted to the repo/branch. — Role lives outside the repo; configure `sub` to the repository/branch when creating it.
- [ ] Prod deployment uses a GitHub Environment with required reviewers. — Prod deploy is manual today; add an environment when CI-driven deploy lands.
- [x] Be careful with `pull_request_target` and fork PRs. — No `pull_request_target` workflows.
- [x] Never commit Terraform state or plan output. — `.gitignore` + gitleaks; `backend.hcl` is local-only.
- [x] Review logs for secret masking (`echo`, `set -x`). — Scripts use `set -euo pipefail` and do not echo parameter values; CI jobs pass credentials via actions/env, not shell traces.

---

## If a Secret Is Accidentally Committed

1. **Rotate the secret immediately** (Stripe, Stability, AWS keys).
2. Remove it from the working tree.
3. Purge it from git history (`git filter-repo` or BFG).
4. Force-push and notify collaborators.
5. Check provider logs for misuse.
6. Add a gitleaks rule or `.gitignore` entry to prevent recurrence.

Making a repo public and then private does **not** erase forks or caches. Decide before the first push; start clean.

---

## Public-Safe Documentation Checklist

Before publishing a doc or diagram:

- [ ] No secrets, tokens, or private keys.
- [ ] No personal email addresses or phone numbers.
- [ ] No AWS account IDs, ARNs, or internal hostnames (or redacted).
- [ ] No real user data or screenshots containing it.
- [ ] No detailed attack paths or unmitigated weakness lists.
- [ ] No internal billing figures if sensitive.
- [ ] Links point to public resources.

## Verification log

| Date | Scope | Result |
|---|---|---|
| 2026-11-11 | Whole repo (tracked files + working tree) before Phase 6 | `git grep` for the account ID, 12-digit ARNs, live keys, and non-example emails found none in tracked files; `gitleaks detect --source . --no-git --redact` reported no leaks. Only placeholders (`sk_test_...`, `whsec_test_secret_123`, `alerts@example.com`, `dev-user@example.com`) remain. Re-run this log whenever docs or fixtures change. |
| 2026-11-12 | M7 UI asset/copy review | Copied source assets (`apps/web/public/images/*`, `apps/web/src/images/tiles_export.jpg`, favicon) contain no user data, secrets, tokens, or tracking URLs; the app makes no external font or Stripe requests. Copy uses the public **Token Shoppe beta** brand, `orders@example.com`, and no customer email or account identifiers. **Open:** artwork licensing/provenance for publishing the copied source images is a product decision, not a secret-scanning result; confirm before making the repo public. |
