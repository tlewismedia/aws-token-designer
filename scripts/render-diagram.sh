#!/usr/bin/env bash
set -euo pipefail
# Render the AWS deployment diagram from D2 (Docker, no local install needed).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker run --rm -v "${REPO_ROOT}":/work -w /work terrastruct/d2 \
  docs/diagrams/aws-deployment.d2 docs/diagrams/aws-deployment.svg
docker run --rm -v "${REPO_ROOT}":/work -w /work terrastruct/d2 \
  docs/diagrams/aws-deployment.d2 docs/diagrams/aws-deployment.png
echo "Done:"
ls -lh "${REPO_ROOT}/docs/diagrams/aws-deployment.svg" "${REPO_ROOT}/docs/diagrams/aws-deployment.png"
