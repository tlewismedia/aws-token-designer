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
  return null
}

/** Validate size and magic bytes before processing. */
export function validateUploadedBuffer(buf: Buffer): SupportedImageType {
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw payloadTooLarge()
  }
  const type = sniffImageType(buf)
  if (!type) {
    throw badRequest('File is not a supported image (PNG, JPEG, or WebP)')
  }
  return type
}

/**
 * Produce the re-encoded (EXIF-stripped) full image and its thumbnail.
 * sharp is imported lazily so the module also loads in unit tests that mock it.
 */
export async function processImage(
  buf: Buffer,
): Promise<{ full: Buffer; thumb: Buffer; contentType: 'image/png' }> {
  const { default: sharp } = await import('sharp')
  const image = sharp(buf).rotate() // bake orientation, drop EXIF
  const full = await image.clone().png().toBuffer()
  const thumb = await sharp(buf)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer()
  return { full, thumb, contentType: 'image/png' }
}
