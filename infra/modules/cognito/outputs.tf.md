# `outputs.tf` — Cognito outputs

**Purpose:** Expose the identities the API and frontend need.

## Outputs

| Output | Consumer |
|---|---|
| `user_pool_id` | API JWT issuer; `VITE_COGNITO_USER_POOL_ID`. |
| `user_pool_arn` | IAM/policy references, debugging. |
| `client_id` | API JWT audience; `VITE_COGNITO_CLIENT_ID`. |
| `presignup_lambda_arn` | Debugging/verification of the trigger. |

## Teaching notes

- The **pool ID** and **client ID** are public configuration, not secrets. They end up in the browser bundle.
- The **issuer** is built from the pool ID and region in the API module: `https://cognito-idp.<region>.amazonaws.com/<poolId>`.
- Never output tokens, client secrets, or user data.

## Related

- `infra/modules/api` (JWT authorizer)
- `apps/web` (Amplify config)
