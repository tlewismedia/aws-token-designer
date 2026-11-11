// S3 media bucket operations: presigned PUT/GET, object reads, deletes.

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ApiConfig } from '../env.js'

let client: S3Client | null = null

function s3(): S3Client {
  if (!client) client = new S3Client({})
  return client
}

export function resetS3ClientForTests(): void {
  client = null
}

/** Presigned PUT constrained to a content type and exact content length. */
export async function createPresignedPut(
  cfg: ApiConfig,
  key: string,
  contentType: string,
  size: number,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: cfg.mediaBucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size, // signed → the URL only accepts an upload of exactly this length
  })
  return getSignedUrl(s3(), cmd, { expiresIn: cfg.uploadUrlTtl })
}

export async function createPresignedGet(cfg: ApiConfig, key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: cfg.mediaBucket, Key: key })
  return getSignedUrl(s3(), cmd, { expiresIn: cfg.getUrlTtl })
}

/** Read an object fully into memory (uploads are capped at 10 MB). */
export async function getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = await res.Body?.transformToByteArray()
  if (!bytes) throw new Error(`Empty object body for ${key}`)
  return Buffer.from(bytes)
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  )
}

/** Delete a batch of keys; ignores missing objects (S3 deletes are idempotent). */
export async function deleteObjects(bucket: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await s3().send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  )
}
