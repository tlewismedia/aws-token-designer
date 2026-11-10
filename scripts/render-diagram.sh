#!/usr/bin/env bash
set -euo pipefail
# Render D2 diagrams to SVG + PNG via Docker (no local D2 install needed).
# Usage: ./scripts/render-diagram.sh [file.d2 ...]
#   With no args, renders docs/diagrams/aws-deployment.d2.
#   With args (e.g. from the lefthook pre-commit hook), renders each .d2 given.
# Skips gracefully with a warning when Docker is unavailable.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

if ! command -v docker >/dev/null 2>&1; then
  echo "render-diagram: docker not found — skipping diagram render." >&2
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  echo "render-diagram: docker daemon unavailable — skipping diagram render." >&2
  exit 0
fi

FILES=("$@")
if [ "${#FILES[@]}" -eq 0 ]; then
  FILES=(docs/diagrams/aws-deployment.d2)
fi

rendered=0
for src in "${FILES[@]}"; do
  case "${src}" in
    *.d2) ;;
    *) continue ;;
  esac
  if [ ! -f "${src}" ]; then
    echo "render-diagram: not found, skipping: ${src}" >&2
    continue
  fi
  base="${src%.d2}"
  docker run --rm -v "${REPO_ROOT}":/work -w /work terrastruct/d2 \
    "${src}" "${base}.svg"
  docker run --rm -v "${REPO_ROOT}":/work -w /work terrastruct/d2 \
    "${src}" "${base}.png"
  rendered=$((rendered + 1))
done

echo "render-diagram: rendered ${rendered} diagram(s)."
