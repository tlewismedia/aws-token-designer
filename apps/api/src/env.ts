// Runtime configuration for the api Lambda. Read per call so tests can stub
// process.env without re-importing modules.

export interface ApiConfig {
  tableName: string
  mediaBucket: string
  /** Presigned PUT lifetime (seconds). */
  uploadUrlTtl: number
  /** Presigned GET lifetime (seconds), PLAN 6.6: 1 hour. */
  getUrlTtl: number
}

export function config(): ApiConfig {
  const tableName = process.env.TABLE_NAME
  const mediaBucket = process.env.MEDIA_BUCKET
  if (!tableName) {
    throw new Error('TABLE_NAME is not set')
  }
  if (!mediaBucket) {
    throw new Error('MEDIA_BUCKET is not set')
  }
  return {
    tableName,
    mediaBucket,
    uploadUrlTtl: 900,
    getUrlTtl: Number(process.env.PRESIGN_TTL ?? 3600),
  }
}
