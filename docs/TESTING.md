# Testing

How to verify AWS Token Designer locally and in CI, plus the manual smoke
checklist and the current deployed-dev status.

## Automated checks

Run from the repo root after `npm ci`:

```sh
npm test        # unit + component + route tests (integration skipped)
npm run lint
npm run typecheck
npm run build
```

The DynamoDB repository integration suite is skipped unless
`RUN_DDB_INTEGRATION=1`. Start DynamoDB Local, then run the API workspace:

```sh
docker run --rm -p 8000:8000 amazon/dynamodb-local
RUN_DDB_INTEGRATION=1 npm test --workspace @aws-token-designer/api
```

The suite defaults to `http://localhost:8000` (override with `DDB_LOCAL_URL`)
and creates/deletes its own `token-designer-test` table, including the `byId`
GSI. CI runs the same command in the `node` job with a DynamoDB Local service
container (`.github/workflows/ci.yml`).

Terraform:

```sh
terraform fmt -check -recursive
# per directory with .tf files:
terraform -chdir=infra/modules/<module> init -backend=false
terraform -chdir=infra/modules/<module> validate
```

## Manual smoke checklist

Against a deployed dev stage (or the Vite dev app pointed at it):

1. **Register/login** — new account logs in; navbar shows 10 credits.
2. **Upload** — drag/drop a PNG/JPEG/WebP under 10 MB; thumbnail appears in
   the gallery.
3. **Add** — add an image to the sheet; count rises.
4. **Remove** — remove a single token by clicking its ×; the clicked token
   disappears, not the tile before it.
5. **Clear** — Clear empties the sheet.
6. **Delete** — delete an image; it leaves the gallery and any sheet that
   referenced it.
7. **Print** — Print opens the browser dialog with the sheet laid out at
   7×9 and waits for thumbnails to load.

API checks (replace `$API` with the dev `api_url` output and `$TOKEN` with a
Cognito ID token; `$IMG` with an image id):

```sh
curl -i "$API/health"                                  # 200
curl -i "$API/me"                                      # 401 without a token
curl -i -H "Authorization: Bearer $TOKEN" "$API/me"    # 200
curl -i -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$API/images/$OTHER_USERS_IMAGE"                     # 403 cross-user
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"big","contentType":"image/png","size":11534336}' \
  "$API/images/upload-url"                             # 413 over 10 MB
curl -i -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"bad","contentType":"application/pdf","size":10}' \
  "$API/images/upload-url"                             # 400 unsupported type
```

`PATCH /sheets/{id}` with `images` validates every id: foreign → 403, unknown
→ 404, non-ready → 400, `[]` → 200, more than 63 entries → 400.

## Deployed dev status

Last verified: **2026-11-11** (dev stage, after the Phase 2 deploy).

- API smoke: **green**
  - health 200, `me` 200 (profile + default sheet bootstrap)
  - upload → complete → thumbnail URL works; add/remove/clear work
  - 63-token cap returns 409 on overflow
  - 11 MB upload returns 413; non-image returns 400
  - cross-user image id returns 403
  - delete removes S3 objects and sheet references
- Browser E2E / print smoke: **outstanding** (requires the deployed SPA and a
  real browser; Playwright automation is a separate issue).

Update this section when the browser/print pass is recorded.
