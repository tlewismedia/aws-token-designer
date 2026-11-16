# `main.tf` — DynamoDB single table

**Purpose:** Create the app’s one DynamoDB table, with the keys and indexes the API relies on.

## Schema

| Element | Value | Why |
|---|---|---|
| `PK` (hash) | `USER#<sub>` or `PAYMENT#<sessionId>` | Partition per user or payment. |
| `SK` (range) | `PROFILE`, `IMAGE#<ulid>`, `SHEET#<ulid>`, `JOB#<ulid>`, `RATE#<date>`, `PAYMENT` | Entity type + sortable id. |
| `byId` GSI | `entityId` hash, projection ALL | Look up an image/sheet by id across users to distinguish 404 vs 403. |
| `ttl` | `expiresAt` | Jobs and daily rate-limit items expire automatically. |
| Billing | `PAY_PER_REQUEST` | No capacity planning; demo traffic is tiny. |
| Encryption | AWS-owned key | SSE at rest without a KMS key cost. |
| PITR | off | Demo default; revisit for prod. |
| `deletion_protection_enabled` | `var.prevent_destroy` | Native prod guard. |

## Teaching notes

- **Single-table design:** one table, many entity types, keys encode ownership. It avoids joins and keeps IAM simple.
- **ULIDs in sort keys** make `begins_with(SK, "IMAGE#")` queries return newest-first when `ScanIndexForward=false`.
- **`byId` is not the primary lookup:** normal reads are scoped to `USER#<sub>`. The GSI exists so a route can tell “does not exist” from “belongs to someone else” — a security/UX distinction.
- **TTL is not immediate:** DynamoDB deletes expired items in the background, usually within 48 hours. Do not rely on TTL for correctness; filter on `expiresAt` in queries where it matters.
- **Deletion protection is a variable:** `lifecycle.prevent_destroy` only accepts literals, so the module uses DynamoDB’s native `deletion_protection_enabled`.

## Safe changes

- Changing keys or adding a GSI is a migration; plan carefully.
- Changing billing mode is in-place but can affect throttling/cost.
- Never disable deletion protection in prod without a deliberate decision.

## Related

- `docs/PLAN.md` §6.5
- `apps/api/src/lib/db.ts`
- `docs/ARCHITECTURE.md` §6.5
