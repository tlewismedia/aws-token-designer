#!/usr/bin/env bash
set -euo pipefail
# Smoke-test the sharp Lambda layer against the emitted api Lambda bundle in
# an arm64 glibc container laid out exactly like the Lambda runtime:
#
#   /var/task/index.mjs                (esbuild bundle, sharp external)
#   /opt/nodejs/node_modules/sharp     (Docker-built arm64 layer content)
#   NODE_PATH=/opt/nodejs/node_modules (as the Node.js Lambda runtime sets it)
#
# Why this exists: Node's ESM resolver ignores NODE_PATH, so a bare
# `import('sharp')` in the bundle throws ERR_MODULE_NOT_FOUND even with the
# layer present. The bundle resolves sharp via createRequire(import.meta.url)
# ('sharp') — CJS resolution honours NODE_PATH. This script proves that end
# to end: bundle load, handler invocation, sharp resolution FROM the layer,
# and a real PNG -> thumbnail round trip.
#
# Prerequisites: ./scripts/build-lambda.sh && ./scripts/build-sharp-layer.sh
# Usage:         ./scripts/smoke-sharp-layer.sh
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

BUNDLE="${REPO_ROOT}/apps/api/dist/index.mjs"
LAYER_MODULES="${REPO_ROOT}/apps/api/dist/sharp-layer/nodejs/node_modules"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "smoke-sharp-layer: docker unavailable — cannot run." >&2
  exit 1
fi
if [[ ! -f "${BUNDLE}" ]]; then
  echo "smoke-sharp-layer: ${BUNDLE} missing — run ./scripts/build-lambda.sh first." >&2
  exit 1
fi
if [[ ! -d "${LAYER_MODULES}/sharp" ]]; then
  echo "smoke-sharp-layer: layer missing — run ./scripts/build-sharp-layer.sh first." >&2
  exit 1
fi

docker run --rm --platform linux/arm64 \
  -v "${REPO_ROOT}/apps/api/dist":/var/task:ro \
  -v "${LAYER_MODULES}":/opt/nodejs/node_modules:ro \
  -e NODE_PATH=/opt/nodejs/node_modules \
  node:22 node --input-type=module -e '
    // 1. The emitted bundle loads in the Lambda layout.
    const mod = await import("/var/task/index.mjs");
    if (typeof mod.handler !== "function") throw new Error("handler not exported");
    console.log("smoke-sharp-layer: bundle loaded, handler exported");

    // 2. Handler invocation (HTTP API v2 shape) — proves the bundle boots
    //    end to end with the layer on NODE_PATH.
    const res = await mod.handler({
      version: "2.0",
      routeKey: "GET /health",
      rawPath: "/health",
      rawQueryString: "",
      headers: {},
      requestContext: { requestId: "smoke", http: { method: "GET", path: "/health" } },
      body: null,
      isBase64Encoded: false,
    });
    console.log(`smoke-sharp-layer: handler GET /health -> ${res.statusCode} ${res.body}`);

    // 3. sharp resolves FROM THE LAYER using the exact mechanism inside
    //    process-image.ts (createRequire rooted at the bundle).
    const { createRequire } = await import("node:module");
    const nodeRequire = createRequire("/var/task/index.mjs");
    const sharpPath = nodeRequire.resolve("sharp");
    console.log(`smoke-sharp-layer: sharp resolved from ${sharpPath}`);
    if (!sharpPath.startsWith("/opt/nodejs/node_modules/")) {
      throw new Error("sharp did not resolve from the layer: " + sharpPath);
    }
    const sharp = nodeRequire("sharp");

    // 4. Real image pipeline: PNG in, 512-capped thumbnail out, EXIF-free.
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#204060" },
    }).png().toBuffer();
    const thumb = await sharp(png).rotate().resize(512, 512, { fit: "inside" }).png().toBuffer();
    const meta = await sharp(thumb).metadata();
    console.log(`smoke-sharp-layer: processed ${png.length}B PNG -> ${thumb.length}B thumbnail (${meta.format} ${meta.width}x${meta.height})`);
    console.log("smoke-sharp-layer: OK");
  '
