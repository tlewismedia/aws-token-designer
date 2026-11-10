#!/usr/bin/env bash
set -euo pipefail
# Render the Python diagrams comparison (Docker: python + graphviz, no local installs).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
docker run --rm -v "${REPO_ROOT}":/work -w /work python:3.11-slim bash -c "
  apt-get update -qq && apt-get install -y -qq graphviz > /dev/null && \
  pip install -q diagrams && \
  python3 docs/diagrams/compare/diagrams/aws_deployment.py
"
echo "Done:"
ls -lh "${REPO_ROOT}/docs/diagrams/compare/diagrams/" | grep aws-deployment
