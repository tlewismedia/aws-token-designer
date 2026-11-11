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
