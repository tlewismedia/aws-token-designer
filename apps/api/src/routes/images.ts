// Image routes: presigned upload, synchronous processing on complete,
// list with presigned GET urls, delete (S3 + DB + sheet refs). PLAN 6.6.

import {
  uploadUrlRequestSchema,
  type Image,
  type ImageWithUrls,
} from '@aws-token-designer/shared'
import { MAX_UPLOAD_BYTES } from '@aws-token-designer/shared'
import type { App } from '../app.js'
import { parseJsonBody } from '../app.js'
import { config } from '../env.js'
import { badRequest, conflict, internalError, payloadTooLarge } from '../lib/errors.js'
import { getRepo, imageFromItem } from '../lib/db.js'
import { processImage, validateUploadedBuffer } from '../lib/process-image.js'
import {
  createPresignedGet,
  createPresignedPut,
  deleteObjects,
  getObjectBuffer,
  putObject,
} from '../lib/s3.js'
import { ulid } from '../lib/ulid.js'

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function uploadKey(sub: string, imageId: string, contentType: string): string {
  const ext = EXTENSION_BY_TYPE[contentType]
  if (!ext) throw badRequest('Unsupported content type')
  return `users/${sub}/images/${imageId}/upload.${ext}`
}

export function fullKey(sub: string, imageId: string): string {
  return `users/${sub}/images/${imageId}/full.png`
}

export function thumbKey(sub: string, imageId: string): string {
  return `users/${sub}/images/${imageId}/thumb.png`
}

/** Attach presigned GET URLs (1h TTL) for ready images. */
async function toResponse(image: Image): Promise<ImageWithUrls> {
  const cfg = config()
  const withUrls: ImageWithUrls = { ...image, thumbUrl: undefined, fullUrl: undefined }
  if (image.status === 'ready') {
    withUrls.thumbUrl = await createPresignedGet(cfg, image.thumbKey)
    withUrls.fullUrl = await createPresignedGet(cfg, image.fullKey)
  }
  return withUrls
}

export function registerImagesRoutes(app: App): void {
  // List images (newest first) with presigned thumbnail/full URLs (FR-6).
  app.get('/images', async (c) => {
    const repo = getRepo()
    const images = await repo.listImages(c.get('sub'))
    const withUrls = await Promise.all(images.map((image) => toResponse(image)))
    return c.json({ images: withUrls })
  })

  // Create a pending image record + presigned PUT (FR-5). The URL signs
  // `content-length`, so an oversized upload fails at S3, not in the Lambda
  // (PLAN 6.6). `content-type` is not signed (the SDK treats it as
  // unsignable), so the real type control is magic-byte validation on
  // complete.
  app.post('/images/upload-url', async (c) => {
    const body = await parseJsonBody(c, uploadUrlRequestSchema)
    if (body.size > MAX_UPLOAD_BYTES) {
      throw payloadTooLarge()
    }
    const cfg = config()
    const repo = getRepo()
    const sub = c.get('sub')
    const imageId = ulid()
    const key = uploadKey(sub, imageId, body.contentType)

    const now = new Date().toISOString()
    const image: Image = {
      id: imageId,
      sub,
      name: body.name,
      description: body.description ?? 'Uploaded image',
      style: body.style,
      status: 'pending',
      fullKey: fullKey(sub, imageId),
      thumbKey: thumbKey(sub, imageId),
      contentType: body.contentType,
      createdAt: now,
    }
    await repo.putImage(image)
    const uploadUrl = await createPresignedPut(cfg, key, body.contentType, body.size)
    return c.json({ imageId, uploadUrl, key }, 201)
  })

  // Validate + process the upload synchronously, then mark ready (FR-5, FR-6).
  app.post('/images/:id/complete', async (c) => {
    const imageId = c.req.param('id')
    const cfg = config()
    const repo = getRepo()
    const sub = c.get('sub')

    const item = await repo.getImageForSub(sub, imageId)
    if (item.status !== 'pending') {
      throw conflict(`Image is already ${item.status}`)
    }
    const key = uploadKey(sub, imageId, item.contentType)

    let buffer: Buffer
    try {
      buffer = await getObjectBuffer(cfg.mediaBucket, key)
      validateUploadedBuffer(buffer)
    } catch (err) {
      // Failed validation: clean up the raw upload and mark the image failed.
      await deleteObjects(cfg.mediaBucket, [key])
      await repo.updateImageStatus(sub, imageId, 'failed')
      throw err
    }

    let processed
    try {
      processed = await processImage(buffer)
    } catch {
      console.error(
        JSON.stringify({
          level: 'error',
          requestId: c.get('requestId'),
          message: 'sharp processing failed',
        }),
      )
      await deleteObjects(cfg.mediaBucket, [key])
      await repo.updateImageStatus(sub, imageId, 'failed')
      throw internalError('Could not process image')
    }

    await putObject(cfg.mediaBucket, item.fullKey, processed.full, 'image/png')
    await putObject(cfg.mediaBucket, item.thumbKey, processed.thumb, 'image/png')
    await deleteObjects(cfg.mediaBucket, [key]) // raw upload no longer needed
    await repo.updateImageStatus(sub, imageId, 'ready')

    const ready = imageFromItem({ ...item, status: 'ready' })
    return c.json(await toResponse(ready))
  })

  // Delete image: S3 objects, DB item, and references in every sheet (FR-10).
  app.delete('/images/:id', async (c) => {
    const imageId = c.req.param('id')
    const cfg = config()
    const repo = getRepo()
    const sub = c.get('sub')

    const item = await repo.getImageForSub(sub, imageId)
    const rawUpload = uploadKey(sub, imageId, item.contentType)
    await deleteObjects(cfg.mediaBucket, [item.fullKey, item.thumbKey, rawUpload])
    await repo.deleteImageItem(sub, imageId)
    await repo.removeImageFromAllSheets(sub, imageId)
    return c.body(null, 204)
  })
}
