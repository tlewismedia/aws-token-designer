// Upload validation + processing (PLAN 6.6): magic-byte sniffing, EXIF strip,
// re-encode, and 512px thumbnail. `sharp` comes from the Docker-built arm64
// Lambda layer (scripts/build-sharp-layer.sh) and is kept external to the
// esbuild bundle.

import { IMAGE_CONTENT_TYPES, MAX_UPLOAD_BYTES, THUMB_SIZE } from '@aws-token-designer/shared'
import { badRequest, payloadTooLarge } from './errors.js'

export type SupportedImageType = (typeof IMAGE_CONTENT_TYPES)[number]

/** Sniff the real image type from magic bytes; null when not a known image. */
export function sniffImageType(buf: Buffer): SupportedImageType | null {
  if (buf.length < 12) return null
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  // WebP: "RIFF" + 4 size bytes + "WEBP"
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  // GIF: "GIF87a" or "GIF89a"
  const header = buf.toString('ascii', 0, 6)
  if (header === 'GIF87a' || header === 'GIF89a') {
    return 'image/gif'
  }
  return null
}

/** Validate size and magic bytes before processing. */
export function validateUploadedBuffer(buf: Buffer): SupportedImageType {
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw payloadTooLarge()
  }
  const type = sniffImageType(buf)
  if (!type) {
    throw badRequest('File is not a supported image (PNG, JPEG, WebP, or GIF)')
  }
  return type
}

/**
 * Load sharp from the Lambda layer.
 *
 * The ESM resolver ignores NODE_PATH, so a bare `import('sharp')` fails at
 * runtime even with the layer mounted (Lambda exposes layer code at
 * /opt/nodejs/node_modules via NODE_PATH, and the bundle lives at /var/task —
 * outside the layer dir, so directory walking cannot find it either).
 * CJS resolution DOES honour NODE_PATH, so we resolve sharp with a require
 * rooted at the bundle. Locally (tests) this resolves the devDependency from
 * apps/api/node_modules — same call path, different root.
 */
async function loadSharp(): Promise<typeof import('sharp')['default']> {
  const { createRequire } = await import('node:module')
  const nodeRequire = createRequire(import.meta.url)
  // With `export =` typings, the import type resolves to the factory function.
  return nodeRequire('sharp') as unknown as typeof import('sharp')['default']
}

/**
 * Produce the re-encoded (EXIF-stripped) full image and its thumbnail.
 * Animated GIFs are flattened to their first frame by sharp's default
 * (single-page) behaviour. sharp comes from the Docker-built arm64 Lambda
 * layer (scripts/build-sharp-layer.sh) and is kept external to the esbuild
 * bundle.
 */
export async function processImage(
  buf: Buffer,
): Promise<{ full: Buffer; thumb: Buffer; contentType: 'image/png' }> {
  const sharp = await loadSharp()
  const image = sharp(buf).rotate() // bake orientation, drop EXIF
  const full = await image.clone().png().toBuffer()
  const thumb = await sharp(buf)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  return { full, thumb, contentType: 'image/png' }
}
