#!/usr/bin/env bash
set -euo pipefail
# Render the D2 comparison diagram (Docker, no local install needed).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
docker run --rm -v "${REPO_ROOT}":/work -w /work terrastruct/d2 \
  docs/diagrams/compare/d2/aws-deployment.d2 docs/diagrams/compare/d2/aws-deployment.svg
docker run --rm -v "${REPO_ROOT}":/work -w /work terrastruct/d2 \
  docs/diagrams/compare/d2/aws-deployment.d2 docs/diagrams/compare/d2/aws-deployment.png
echo "Done:"
ls -lh "${REPO_ROOT}/docs/diagrams/compare/d2/aws-deployment.svg" "${REPO_ROOT}/docs/diagrams/compare/d2/aws-deployment.png"
