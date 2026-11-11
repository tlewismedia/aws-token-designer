// Domain limits and constants shared by the API, web app, and Terraform
// sizing. Keep in sync with docs/PLAN.md sections 6.4-6.6.

/** Maximum tokens (image references) on one sheet. */
export const MAX_SHEET_TOKENS = 63

/** Maximum accepted upload size in bytes (10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Content types accepted for uploads (also the presigned PUT constraint). */
export const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number]

/** Generation styles (parity with the source app). */
export const IMAGE_STYLES = ['photographic', 'anime'] as const
export type ImageStyle = (typeof IMAGE_STYLES)[number]

/** Credits granted on first login (lazy profile bootstrap). */
export const DEFAULT_CREDITS = 10

/** Thumbnail edge length in pixels. */
export const THUMB_SIZE = 512

/** Presigned GET URL lifetime in seconds (1 hour per PLAN 6.6). */
export const PRESIGN_TTL_SECONDS = 3600

/** DynamoDB key prefixes / sort keys (PLAN 6.5). */
export const PK_PREFIX = 'USER#'
export const SK_PROFILE = 'PROFILE'
export const SK_IMAGE_PREFIX = 'IMAGE#'
export const SK_SHEET_PREFIX = 'SHEET#'

/** Name of the sheet created on first login. */
export const DEFAULT_SHEET_NAME = 'Default Sheet'

/** Sheet template id (parity with the source app). */
export const DEFAULT_SHEET_TEMPLATE = 'default'
