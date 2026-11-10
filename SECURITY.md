# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| `main` (latest) | :white_check_mark: |
| Older commits / tags | :x: (upgrade to latest `main`) |

Security fixes are applied to the latest `main` only.

## Reporting a Vulnerability

**Do not open a public issue, pull request, or discussion for vulnerabilities.**

Report privately via **GitHub private vulnerability reporting**:

1. Go to the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Describe the issue, affected files/versions, and steps to reproduce if known.

Guidance for reporters is in [`docs/PUBLIC_SAFE.md`](docs/PUBLIC_SAFE.md):
never include secrets, tokens, private keys, or real user data in a report.

## What to Expect

- **Acknowledgement** within 3 business days of your report.
- **Status updates** as triage and remediation progress.
- **No public disclosure before a fix is available.** We will coordinate
  disclosure timing with you once a fix is merged; please do not disclose
  the issue publicly until then.
- Credit in the fix notes if you wish (opt-in).

## Scope

**In scope:**

- This repository's code, Terraform modules, scripts, and documentation
  (e.g. dependency, injection, auth, or access-control flaws in this project).

**Out of scope:**

- The Firebase source project this port is derived from.
- The AWS account itself (IAM, billing, or account-level configuration).
- Third-party services (Stripe, Stability AI, GitHub, npm) — report those
  to the respective vendor.
- Social engineering, physical attacks, or denial-of-service testing
  against any live environment.
