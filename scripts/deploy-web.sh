#!/usr/bin/env bash
# Build the SPA with public dev outputs and publish it to the CloudFront-fronted
# S3 web bucket (PLAN 7.4 / Phase 5).
#
#   ./scripts/deploy-web.sh
#
# Reads terraform outputs from infra/envs/dev (override with ENV_DIR=...).
# The SPA is built WITHOUT an API URL: it calls relative /api/... and CloudFront
# proxies that to execute-api on the same origin (ADR-0003).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

ENV_DIR="${ENV_DIR:-infra/envs/dev}"
DIST_DIR="apps/web/dist"

die() {
  printf 'deploy-web: %s\n' "$*" >&2
  exit 1
}

command -v terraform >/dev/null 2>&1 || die "terraform not found in PATH"
command -v aws >/dev/null 2>&1 || die "aws CLI not found in PATH"

aws sts get-caller-identity >/dev/null 2>&1 ||
  die "AWS credentials are missing or invalid (aws sts get-caller-identity failed)"

tf_output() {
  terraform -chdir="${ENV_DIR}" output -raw "$1" 2>/dev/null ||
    die "terraform output '$1' is missing — init + apply ${ENV_DIR} first (see docs/TERRAFORM.md)"
}

REGION="$(tf_output aws_region)"
POOL_ID="$(tf_output user_pool_id)"
CLIENT_ID="$(tf_output client_id)"
BUCKET="$(tf_output web_bucket_name)"
DISTRIBUTION_ID="$(tf_output cloudfront_distribution_id)"
WEB_URL="$(tf_output web_url)"

# Public build-time config only. No VITE_API_URL: the browser calls relative
# /api paths, and CloudFront forwards them to the HTTP API stage `api`.
export VITE_AWS_REGION="${REGION}"
export VITE_COGNITO_USER_POOL_ID="${POOL_ID}"
export VITE_COGNITO_CLIENT_ID="${CLIENT_ID}"
unset VITE_API_URL

echo "deploy-web: building SPA for ${WEB_URL}"
npm run build --workspace @aws-token-designer/web

[ -f "${DIST_DIR}/index.html" ] || die "build did not produce ${DIST_DIR}/index.html"

# 1. Content-hashed bundles are immutable; --delete removes stale ones.
#    index.html is excluded from this pass so it is never cached for a year.
aws s3 sync "${DIST_DIR}" "s3://${BUCKET}" \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable"

# 2. index.html points at the new hashes, so it must revalidate every load.
aws s3 cp "${DIST_DIR}/index.html" "s3://${BUCKET}/index.html" \
  --cache-control "no-cache" \
  --content-type "text/html; charset=utf-8"

# 3. The only stable key that changed is /index.html; hashed assets are new URLs.
aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/index.html" >/dev/null

echo "deploy-web: deployed ${WEB_URL}"
