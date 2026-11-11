#!/usr/bin/env bash
set -euo pipefail
# Bundle the api Lambda: esbuild (single ESM file, sharp external) into
# apps/api/dist/index.mjs. Terraform zips it (infra/modules/lambda).
# Usage: ./scripts/build-lambda.sh
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

npm run build --workspace @aws-token-designer/api

echo "build-lambda: bundle at apps/api/dist/index.mjs"
