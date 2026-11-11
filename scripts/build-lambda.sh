#!/usr/bin/env bash
set -euo pipefail
# Bundle both Lambdas: esbuild (ESM, sharp external) into
#   apps/api/dist/index.mjs   (api)
#   apps/api/dist/worker.mjs  (generateWorker)
# Terraform zips them (infra/modules/lambda).
# Usage: ./scripts/build-lambda.sh
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

npm run build --workspace @aws-token-designer/api

echo "build-lambda: bundles at apps/api/dist/{index,worker}.mjs"
