import { z } from 'zod'
import { DEFAULT_CREDITS, IMAGE_STYLES, MAX_SHEET_TOKENS } from './constants.js'

export * from './constants.js'

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export const profileSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  credits: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})
export type Profile = z.infer<typeof profileSchema>

export const imageStatusSchema = z.enum(['pending', 'ready', 'failed'])
export type ImageStatus = z.infer<typeof imageStatusSchema>

export const imageSchema = z.object({
  id: z.string().min(1),
  sub: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  style: z.enum(IMAGE_STYLES).optional(),
  status: imageStatusSchema,
  fullKey: z.string().min(1),
  thumbKey: z.string().min(1),
  contentType: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})
export type Image = z.infer<typeof imageSchema>

/** Image as returned by GET /images: metadata plus presigned URLs. */
export const imageWithUrlsSchema = imageSchema.extend({
  thumbUrl: z.string().optional(),
  fullUrl: z.string().optional(),
})
export type ImageWithUrls = z.infer<typeof imageWithUrlsSchema>

// ---------------------------------------------------------------------------
// Generation jobs (PLAN 6.5, 6.7)
// ---------------------------------------------------------------------------

export const jobStatusSchema = z.enum(['pending', 'processing', 'succeeded', 'failed'])
export type JobStatus = z.infer<typeof jobStatusSchema>

/** Terminal job states (the client stops polling on either). */
export const TERMINAL_JOB_STATUSES = ['succeeded', 'failed'] as const

export const jobSchema = z.object({
  id: z.string().min(1),
  sub: z.string().min(1),
  type: z.literal('generation'),
  status: jobStatusSchema,
  /** Target IMAGE id chosen by the API up front (worker writes it on success). */
  imageId: z.string().min(1),
  prompt: z.string().min(1).max(1000),
  negativePrompt: z.string().max(1000).optional(),
  style: z.enum(IMAGE_STYLES).optional(),
  /** Safe error code (never a provider message or secret). */
  error: z.string().max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  /** DynamoDB TTL, epoch seconds. */
  expiresAt: z.number().int().optional(),
})
export type Job = z.infer<typeof jobSchema>

export const sheetSchema = z.object({
  id: z.string().min(1),
  sub: z.string().min(1),
  name: z.string().min(1).max(100),
  template: z.string().min(1).max(50),
  images: z.array(z.string()).max(MAX_SHEET_TOKENS),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
})
export type Sheet = z.infer<typeof sheetSchema>

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const meResponseSchema = z.object({
  profile: profileSchema,
  /** Sheet ids owned by the user, newest first. */
  sheets: z.array(sheetSchema),
})
export type MeResponse = z.infer<typeof meResponseSchema>

export const imagesResponseSchema = z.object({
  images: z.array(imageWithUrlsSchema),
})
export type ImagesResponse = z.infer<typeof imagesResponseSchema>

export const uploadUrlResponseSchema = z.object({
  imageId: z.string(),
  uploadUrl: z.string(),
  key: z.string(),
})
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>

export const sheetsResponseSchema = z.object({
  sheets: z.array(sheetSchema),
})
export type SheetsResponse = z.infer<typeof sheetsResponseSchema>

export const generateImageResponseSchema = z.object({
  jobId: z.string().min(1),
})
export type GenerateImageResponse = z.infer<typeof generateImageResponseSchema>

export const jobResponseSchema = z.object({
  job: jobSchema,
})
export type JobResponse = z.infer<typeof jobResponseSchema>

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const uploadUrlRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  style: z.enum(IMAGE_STYLES).optional(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  /**
   * Exact upload size in bytes. The presigned PUT signs Content-Length, so
   * the upload must match exactly (PLAN 6.6: content-type + size
   * constraints). Sizes over the cap are rejected with 413 by the route.
   */
  size: z.number().int().positive(),
})
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>

export const createSheetRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  template: z.string().trim().min(1).max(50).default('default'),
})
export type CreateSheetRequest = z.infer<typeof createSheetRequestSchema>

export const updateSheetRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  template: z.string().trim().min(1).max(50).optional(),
  /** Full replacement of the token list (used by "clear sheet"). */
  images: z.array(z.string()).max(MAX_SHEET_TOKENS).optional(),
})
export type UpdateSheetRequest = z.infer<typeof updateSheetRequestSchema>

export const addTokenRequestSchema = z.object({
  imageId: z.string().min(1),
})
export type AddTokenRequest = z.infer<typeof addTokenRequestSchema>

/**
 * POST /images/generate (FR-4). The prompt is the only required field; a
 * negative prompt and style are optional and map to Stability parameters.
 */
export const generateImageRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  negativePrompt: z.string().trim().max(1000).optional(),
  style: z.enum(IMAGE_STYLES).optional(),
})
export type GenerateImageRequest = z.infer<typeof generateImageRequestSchema>

// ---------------------------------------------------------------------------
// Error envelope (PLAN 6.4)
// ---------------------------------------------------------------------------

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
})
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>

export const DEFAULT_CREDITS_ON_BOOTSTRAP = DEFAULT_CREDITS
