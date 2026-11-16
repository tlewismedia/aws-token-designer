# `main.tf` — Cognito module

**Purpose:** Create the user pool, the public SPA client, and the pre-sign-up Lambda that auto-confirms accounts for the demo.

## Resources

| Resource | Role |
|---|---|
| `data.archive_file.presignup` | Zips an inline `index.mjs` handler. |
| `aws_iam_role.presignup` + basic attachment | Execution role for the trigger. |
| `aws_cloudwatch_log_group.presignup` | Retention-controlled logs. |
| `aws_lambda_function.presignup` | Node 22 ESM handler; auto-confirms and auto-verifies email. |
| `aws_cognito_user_pool.main` | Email sign-in, auto-verified email, password min 8, MFA off, advanced security off, `pre_sign_up` trigger. |
| `aws_cognito_user_pool_client.main` | Public SPA client: no secret; password + SRP + refresh flows; `prevent_user_existence_errors = ENABLED`. |
| `aws_lambda_permission.cognito_invoke` | Allows Cognito to invoke the trigger. |

## Teaching notes

- **Why a Lambda for auto-confirm:** the demo wants Firebase-like immediate sign-in. A pre-sign-up trigger sets `autoConfirmUser` and `autoVerifyEmail`. Production should switch to real verification (and SES).
- **ESM gotcha:** the handler file is `index.mjs`, so it must use `export const handler`, not `exports.handler`. The latter fails at runtime with “exports is not defined in ES module scope” and is easy to miss in static checks.
- **No hosted UI domain:** custom forms + Amplify Auth only. That is why there is no `aws_cognito_user_pool_domain`.
- **No client secret:** a browser SPA cannot keep one. The client is public by design.
- **Deletion protection is variable-driven:** Cognito has a native `deletion_protection` setting; prod passes `prevent_destroy = true`, dev leaves it off so the stack can be torn down.
- **Log group before function:** `depends_on` prevents Lambda from auto-creating an unbounded-retention log group.

## Safe changes

- Changing password policy or auth flows affects login; test in dev.
- Do not remove the pre-sign-up trigger without adding a verification flow.
- Never add a client secret to a SPA.

## Related

- ADR-0006
- `apps/web` (Amplify Auth)
- `docs/PLAN.md` §6.3
