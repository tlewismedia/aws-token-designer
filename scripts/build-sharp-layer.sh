#!/usr/bin/env bash
set -euo pipefail
# Build the arm64 Lambda layer for `sharp` via Docker (PLAN 7.3, decision 17).
#
# Output: apps/api/dist/sharp-layer/nodejs/node_modules/sharp (plus deps).
# Terraform (infra/modules/lambda) zips that directory into the layer.
#
# Why Docker: sharp ships prebuilt linux-arm64 binaries; installing it inside
# an arm64 container guarantees a Lambda-compatible binary regardless of the
# host platform.
#
# Usage: ./scripts/build-sharp-layer.sh
# Requires a running Docker daemon; exits with instructions when unavailable.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'EOF'
build-sharp-layer: docker not found.
Install Docker, then re-run this script. The layer zip must exist before
`terraform apply` (infra/modules/lambda zips apps/api/dist/sharp-layer).
EOF
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  cat >&2 <<'EOF'
build-sharp-layer: docker daemon unavailable.
Start Docker, then re-run this script.
EOF
  exit 1
fi

LAYER_DIR="${REPO_ROOT}/apps/api/dist/sharp-layer"
rm -rf "${LAYER_DIR}"
mkdir -p "${LAYER_DIR}/nodejs"

# NOTE: Debian (glibc) base on purpose — Lambda's arm64 runtime is
# Amazon Linux (glibc). An Alpine (musl) install pulls the wrong
# @img/* binaries and fails to load at runtime.
docker run --rm --platform linux/arm64 \
  -v "${LAYER_DIR}/nodejs":/var/task/nodejs \
  -w /var/task \
  node:22 sh -c '
    set -e
    mkdir -p nodejs/node_modules
    cd nodejs
    npm install --omit=dev --omit=peer --no-audit --no-fund \
      --ignore-scripts=false sharp
    # Keep only the glibc linux-arm64 prebuilds (what Lambda arm64 loads).
    # The "colour" dir is shared colour-management, not a platform build.
    find node_modules/@img -maxdepth 1 -type d \
      ! -name "@img" \
      ! -name "sharp-linux-arm64" \
      ! -name "sharp-libvips-linux-arm64" \
      ! -name "colour" \
      -exec rm -rf {} + 2>/dev/null || true
    ls node_modules/@img || true
  '

echo "build-sharp-layer: layer content at ${LAYER_DIR}"
echo "build-sharp-layer: nodejs/node_modules contents:"
ls "${LAYER_DIR}/nodejs/node_modules" | sed 's/^/  /'
