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
export const SK_JOB_PREFIX = 'JOB#'
export const SK_RATE_PREFIX = 'RATE#'

// ---------------------------------------------------------------------------
// AI generation guardrails (PLAN 6.7, ADR-0008)
// ---------------------------------------------------------------------------

/** Per-user generations allowed per UTC day. */
export const DAILY_GENERATION_CAP = 20

/** Job record TTL in days (DynamoDB `expiresAt`, epoch seconds). */
export const JOB_TTL_DAYS = 7

/** Daily rate-limit item TTL in days (covers UTC-day rollover + clock skew). */
export const RATE_TTL_DAYS = 2

/** Documented Stability ultra cost estimate per image, in USD. */
export const ESTIMATED_AI_COST_USD = 0.08

/** CloudWatch EMF namespace/dimension shared by the worker and alarms. */
export const GENERATION_METRIC_NAMESPACE = 'TokenDesigner'
export const GENERATION_METRIC_DIMENSION = 'Stage'

/** Client polling cadence for an in-flight generation job (PLAN 6.9). */
export const JOB_POLL_INTERVAL_MS = 2000

/** Stability request timeout (milliseconds). */
export const STABILITY_TIMEOUT_MS = 90_000

/** Name of the sheet created on first login. */
export const DEFAULT_SHEET_NAME = 'Default Sheet'

/** Sheet template id (parity with the source app). */
export const DEFAULT_SHEET_TEMPLATE = 'default'
