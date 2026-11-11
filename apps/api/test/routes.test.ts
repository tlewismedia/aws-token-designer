// Route-level unit tests. The DynamoDB repo and S3 module are mocked; `sharp`
// is real, so the complete-route tests exercise actual image processing.

import { beforeAll, describe, expect, it, vi } from 'vitest'

process.env.TABLE_NAME = 'test-table'
process.env.MEDIA_BUCKET = 'test-bucket'

const repoStub = vi.hoisted(() => ({
  getProfile: vi.fn(),
  createProfileIfAbsent: vi.fn(),
  ensureDefaultSheet: vi.fn(),
  listSheets: vi.fn(),
  listImages: vi.fn(),
  putImage: vi.fn(),
  getImageForSub: vi.fn(),
  updateImageStatus: vi.fn(),
  deleteImageItem: vi.fn(),
  removeImageFromAllSheets: vi.fn(),
  putSheet: vi.fn(),
  getSheetForSub: vi.fn(),
  addTokenToSheet: vi.fn(),
  updateSheet: vi.fn(),
  deleteSheetItem: vi.fn(),
}))

vi.mock('../src/lib/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/db.js')>()
  return { ...actual, getRepo: () => repoStub }
})

const s3Mock = vi.hoisted(() => ({
  createPresignedPut: vi.fn(async () => 'https://s3-presigned-put'),
  createPresignedGet: vi.fn(async () => 'https://s3-presigned-get'),
  getObjectBuffer: vi.fn(),
  putObject: vi.fn(),
  deleteObjects: vi.fn(),
}))

vi.mock('../src/lib/s3.js', () => s3Mock)

import { createApp } from '../src/app.js'
import { handler } from '../src/index.js'
import { forbidden, notFound } from '../src/lib/errors.js'
import type { ImageWithUrls, Sheet } from '@aws-token-designer/shared'
import sharp from 'sharp'

const claimsEvent = (sub = 'user-1', email = 'user-1@example.com') => ({
  event: {
    requestContext: {
      requestId: 'req-123',
      authorizer: { jwt: { claims: { sub, email } } },
    },
  },
})

function authedRequest(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  return app.request(path, init, claimsEvent())
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

function envelope(body: unknown) {
  const parsed = body as { error?: { code: string; requestId: string } }
  expect(parsed.error).toBeDefined()
  expect(typeof parsed.error?.requestId).toBe('string')
  return parsed.error as { code: string; requestId: string }
}

async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: '#204060' } })
    .png()
    .toBuffer()
}

beforeAll(() => {
  vi.clearAllMocks()
})

describe('auth middleware', () => {
  it('serves /health without authentication', async () => {
    const app = createApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ status: 'ok' })
  })

  it('rejects unauthenticated requests with a 401 envelope', async () => {
    const app = createApp()
    const res = await app.request('/me')
    expect(res.status).toBe(401)
    const body = await json(res)
    expect(envelope(body).code).toBe('UNAUTHENTICATED')
  })
})

// API Gateway HTTP API v2 includes the stage name in `rawPath`; this exercises
// the real @hono/aws-lambda adapter, which the direct app.request() tests above
// do not. Guards against routes being unreachable at the deployed `/api` path.
function apiGatewayEvent(path: string, method = 'GET', sub?: string) {
  return {
    version: '2.0',
    routeKey: `${method} ${path.replace('/api', '')}`,
    rawPath: path,
    rawQueryString: '',
    headers: { host: 'example.execute-api.us-west-2.amazonaws.com' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'abc123',
      domainName: 'example.execute-api.us-west-2.amazonaws.com',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-handler',
      routeKey: `${method} ${path.replace('/api', '')}`,
      stage: 'api',
      time: '2026-01-01T00:00:00Z',
      timeEpoch: 0,
      ...(sub ? { authorizer: { jwt: { claims: { sub, email: `${sub}@example.com` } } } } : {}),
    },
    isBase64Encoded: false,
  }
}

describe('Lambda handler (API Gateway v2 stage prefix)', () => {
  it('serves GET /api/health without authentication', async () => {
    const res = (await handler(
      apiGatewayEvent('/api/health') as never,
      {} as never,
    )) as { statusCode: number; body: string }
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
  })

  it('routes GET /api/me with JWT claims from the event', async () => {
    vi.clearAllMocks()
    repoStub.getProfile.mockResolvedValue({
      sub: 'user-1',
      email: 'user-1@example.com',
      credits: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    repoStub.listSheets.mockResolvedValue([])
    const res = (await handler(
      apiGatewayEvent('/api/me', 'GET', 'user-1') as never,
      {} as never,
    )) as { statusCode: number; body: string }
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).profile.sub).toBe('user-1')
  })
})

describe('GET /me', () => {
  it('bootstraps profile + default sheet and returns both', async () => {
    vi.clearAllMocks()
    repoStub.getProfile.mockResolvedValueOnce(null).mockResolvedValueOnce({
      sub: 'user-1',
      email: 'user-1@example.com',
      credits: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    repoStub.listSheets.mockResolvedValue([
      { id: 'sheet-1', sub: 'user-1', name: 'Default Sheet', template: 'default', images: [], createdAt: 'x' },
    ])
    const app = createApp()
    const res = await authedRequest(app, '/me')
    expect(res.status).toBe(200)
    const body = await json<{ profile: { credits: number }; sheets: { id: string }[] }>(res)
    expect(body.profile.credits).toBe(10)
    expect(body.sheets).toHaveLength(1)
    expect(repoStub.createProfileIfAbsent).toHaveBeenCalledWith('user-1', 'user-1@example.com')
    expect(repoStub.ensureDefaultSheet).toHaveBeenCalledWith('user-1')
  })
})

describe('POST /images/upload-url', () => {
  it('returns 201 with imageId + presigned PUT', async () => {
    vi.clearAllMocks()
    repoStub.putImage.mockResolvedValue(undefined)
    const app = createApp()
    const res = await authedRequest(app, '/images/upload-url', {
      method: 'POST',
      body: JSON.stringify({ name: 'Goblin', contentType: 'image/png', size: 2048 }),
    })
    expect(res.status).toBe(201)
    const body = await json<{ imageId: string; uploadUrl: string; key: string }>(res)
    expect(body.imageId).toBeTruthy()
    expect(body.uploadUrl).toBe('https://s3-presigned-put')
    expect(repoStub.putImage).toHaveBeenCalledTimes(1)
    // Presign is constrained to the declared content type + exact size.
    expect(s3Mock.createPresignedPut).toHaveBeenCalledWith(
      expect.objectContaining({ mediaBucket: 'test-bucket' }),
      expect.stringMatching(/^users\/user-1\/images\/.+\/upload\.png$/),
      'image/png',
      2048,
    )
  })

  it('rejects sizes over the 10 MB cap with 413 before presigning', async () => {
    vi.clearAllMocks()
    const app = createApp()
    const res = await authedRequest(app, '/images/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Too Big',
        contentType: 'image/png',
        size: 10 * 1024 * 1024 + 1,
      }),
    })
    expect(res.status).toBe(413)
    expect(envelope(await json(res)).code).toBe('PAYLOAD_TOO_LARGE')
    expect(s3Mock.createPresignedPut).not.toHaveBeenCalled()
    expect(repoStub.putImage).not.toHaveBeenCalled()
  })

  it('rejects invalid bodies with 400 + envelope', async () => {
    const app = createApp()
    const res = await authedRequest(app, '/images/upload-url', {
      method: 'POST',
      body: JSON.stringify({ contentType: 'application/pdf' }),
    })
    expect(res.status).toBe(400)
    expect(envelope(await json(res)).code).toBe('VALIDATION_ERROR')
  })

  it('rejects non-JSON bodies with 400', async () => {
    const app = createApp()
    const res = await authedRequest(app, '/images/upload-url', {
      method: 'POST',
      body: 'not json',
    })
    expect(res.status).toBe(400)
    expect(envelope(await json(res)).code).toBe('INVALID_REQUEST')
  })
})

describe('POST /images/:id/complete', () => {
  const pendingItem = {
    PK: 'USER#user-1',
    SK: 'IMAGE#img-1',
    entityId: 'img-1',
    name: 'Goblin',
    status: 'pending',
    fullKey: 'users/user-1/images/img-1/full.png',
    thumbKey: 'users/user-1/images/img-1/thumb.png',
    contentType: 'image/png',
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('processes a real PNG and returns the ready image with URLs', async () => {
    vi.clearAllMocks()
    repoStub.getImageForSub.mockResolvedValue(pendingItem)
    s3Mock.getObjectBuffer.mockResolvedValue(await tinyPng())
    const app = createApp()
    const res = await authedRequest(app, '/images/img-1/complete', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await json<ImageWithUrls>(res)
    expect(body.status).toBe('ready')
    expect(body.thumbUrl).toBe('https://s3-presigned-get')
    // full + thumb written, raw upload removed
    expect(s3Mock.putObject).toHaveBeenCalledTimes(2)
    expect(s3Mock.deleteObjects).toHaveBeenCalledWith('test-bucket', [
      'users/user-1/images/img-1/upload.png',
    ])
    expect(repoStub.updateImageStatus).toHaveBeenCalledWith('user-1', 'img-1', 'ready')
    const fullBody = s3Mock.putObject.mock.calls[0][2] as Buffer
    const thumbBody = s3Mock.putObject.mock.calls[1][2] as Buffer
    expect(fullBody.length).toBeGreaterThan(0)
    const thumbMeta = await sharp(thumbBody).metadata()
    expect(thumbMeta.format).toBe('png')
    expect(thumbMeta.width).toBeLessThanOrEqual(512)
  })

  it('returns 400 and marks the image failed for non-images', async () => {
    vi.clearAllMocks()
    repoStub.getImageForSub.mockResolvedValue(pendingItem)
    s3Mock.getObjectBuffer.mockResolvedValue(Buffer.from('this is not an image at all'))
    const app = createApp()
    const res = await authedRequest(app, '/images/img-1/complete', { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(envelope(body).code).toBe('INVALID_REQUEST')
    expect(repoStub.updateImageStatus).toHaveBeenCalledWith('user-1', 'img-1', 'failed')
    expect(s3Mock.putObject).not.toHaveBeenCalled()
  })

  it('returns 413 for oversized uploads', async () => {
    vi.clearAllMocks()
    repoStub.getImageForSub.mockResolvedValue(pendingItem)
    s3Mock.getObjectBuffer.mockResolvedValue(Buffer.alloc(10 * 1024 * 1024 + 1))
    const app = createApp()
    const res = await authedRequest(app, '/images/img-1/complete', { method: 'POST' })
    expect(res.status).toBe(413)
    expect(envelope(await json(res)).code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('returns 409 when the image was already completed', async () => {
    vi.clearAllMocks()
    repoStub.getImageForSub.mockResolvedValue({ ...pendingItem, status: 'ready' })
    const app = createApp()
    const res = await authedRequest(app, '/images/img-1/complete', { method: 'POST' })
    expect(res.status).toBe(409)
  })
})

describe('DELETE /images/:id', () => {
  it('deletes S3 objects, the DB item, and sheet references', async () => {
    vi.clearAllMocks()
    repoStub.getImageForSub.mockResolvedValue({
      ...{ PK: 'USER#user-1', SK: 'IMAGE#img-1', entityId: 'img-1' },
      name: 'Goblin',
      status: 'ready',
      fullKey: 'users/user-1/images/img-1/full.png',
      thumbKey: 'users/user-1/images/img-1/thumb.png',
      contentType: 'image/png',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const app = createApp()
    const res = await authedRequest(app, '/images/img-1', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(s3Mock.deleteObjects).toHaveBeenCalledWith('test-bucket', [
      'users/user-1/images/img-1/full.png',
      'users/user-1/images/img-1/thumb.png',
      'users/user-1/images/img-1/upload.png',
    ])
    expect(repoStub.deleteImageItem).toHaveBeenCalledWith('user-1', 'img-1')
    expect(repoStub.removeImageFromAllSheets).toHaveBeenCalledWith('user-1', 'img-1')
  })

  it('returns 403 for another user\u2019s image id', async () => {
    vi.clearAllMocks()
    repoStub.getImageForSub.mockRejectedValue(forbidden('Image belongs to another user'))
    const app = createApp()
    const res = await authedRequest(app, '/images/someone-elses', { method: 'DELETE' })
    expect(res.status).toBe(403)
  })

  it('returns 404 for an unknown image id', async () => {
    vi.clearAllMocks()
    repoStub.getImageForSub.mockRejectedValue(notFound('Image not found'))
    const app = createApp()
    const res = await authedRequest(app, '/images/missing', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

describe('sheets routes', () => {
  const sheet = {
    PK: 'USER#user-1',
    SK: 'SHEET#sheet-1',
    entityId: 'sheet-1',
    id: 'sheet-1',
    sub: 'user-1',
    name: 'Default Sheet',
    template: 'default',
    images: [] as string[],
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('creates a sheet', async () => {
    vi.clearAllMocks()
    repoStub.putSheet.mockResolvedValue(undefined)
    const app = createApp()
    const res = await authedRequest(app, '/sheets', {
      method: 'POST',
      body: JSON.stringify({ name: 'Boss Fight' }),
    })
    expect(res.status).toBe(201)
    const body = await json<{ sheet: Sheet }>(res)
    expect(body.sheet.name).toBe('Boss Fight')
    expect(body.sheet.template).toBe('default')
    expect(body.sheet.images).toEqual([])
  })

  it('adds a token and returns the updated sheet', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub
      .mockResolvedValueOnce(sheet) // ownership check
      .mockResolvedValueOnce({ ...sheet, images: ['img-1'] }) // re-read
    repoStub.getImageForSub.mockResolvedValue({
      entityId: 'img-1',
      PK: 'USER#user-1',
      status: 'ready',
    })
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1/images', {
      method: 'POST',
      body: JSON.stringify({ imageId: 'img-1' }),
    })
    expect(res.status).toBe(201)
    const body = await json<{ sheet: Sheet }>(res)
    expect(body.sheet.images).toEqual(['img-1'])
  })

  it('returns 409 when the sheet is full (repo conflict)', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub.mockResolvedValue(sheet)
    repoStub.getImageForSub.mockResolvedValue({ entityId: 'img-1', status: 'ready' })
    const { conflict } = await import('../src/lib/errors.js')
    repoStub.addTokenToSheet.mockRejectedValue(conflict('Sheet already has the maximum of 63 tokens'))
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1/images', {
      method: 'POST',
      body: JSON.stringify({ imageId: 'img-1' }),
    })
    expect(res.status).toBe(409)
    expect(envelope(await json(res)).code).toBe('CONFLICT')
  })

  it('rejects adding pending images', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub.mockResolvedValue(sheet)
    repoStub.getImageForSub.mockResolvedValue({ entityId: 'img-1', status: 'pending' })
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1/images', {
      method: 'POST',
      body: JSON.stringify({ imageId: 'img-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('removes a token by index', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub
      .mockResolvedValueOnce({ ...sheet, images: ['a', 'b', 'c'] })
      .mockResolvedValueOnce({ ...sheet, images: ['a', 'c'] })
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1/images/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await json<{ sheet: Sheet }>(res)
    expect(body.sheet.images).toEqual(['a', 'c'])
    expect(repoStub.updateSheet).toHaveBeenCalledWith('user-1', 'sheet-1', { images: ['a', 'c'] })
  })

  it('returns 404 for an out-of-range index', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub.mockResolvedValue({ ...sheet, images: ['a'] })
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1/images/5', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('clears the sheet via PATCH images: []', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub
      .mockResolvedValueOnce({ ...sheet, images: ['a'] })
      .mockResolvedValueOnce(sheet)
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1', {
      method: 'PATCH',
      body: JSON.stringify({ images: [] }),
    })
    expect(res.status).toBe(200)
    expect(repoStub.updateSheet).toHaveBeenCalledWith('user-1', 'sheet-1', { images: [] })
    expect(repoStub.getImageForSub).not.toHaveBeenCalled()
  })

  it('accepts PATCH images referencing ready, owned images', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub.mockResolvedValue(sheet)
    repoStub.getImageForSub.mockResolvedValue({ entityId: 'img-1', status: 'ready' })
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1', {
      method: 'PATCH',
      body: JSON.stringify({ images: ['img-1', 'img-1'] }),
    })
    expect(res.status).toBe(200)
    expect(repoStub.getImageForSub).toHaveBeenCalledTimes(2)
    expect(repoStub.getImageForSub).toHaveBeenCalledWith('user-1', 'img-1')
    expect(repoStub.updateSheet).toHaveBeenCalledWith('user-1', 'sheet-1', {
      images: ['img-1', 'img-1'],
    })
  })

  it('rejects PATCH images with a foreign image id (403)', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub.mockResolvedValue(sheet)
    repoStub.getImageForSub.mockRejectedValue(forbidden('Image belongs to another user'))
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1', {
      method: 'PATCH',
      body: JSON.stringify({ images: ['someone-elses-image'] }),
    })
    expect(res.status).toBe(403)
    expect(envelope(await json(res)).code).toBe('FORBIDDEN')
    expect(repoStub.updateSheet).not.toHaveBeenCalled()
  })

  it('rejects PATCH images with an unknown image id (404)', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub.mockResolvedValue(sheet)
    repoStub.getImageForSub.mockRejectedValue(notFound('Image not found'))
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1', {
      method: 'PATCH',
      body: JSON.stringify({ images: ['missing-image'] }),
    })
    expect(res.status).toBe(404)
    expect(envelope(await json(res)).code).toBe('NOT_FOUND')
    expect(repoStub.updateSheet).not.toHaveBeenCalled()
  })

  it('rejects PATCH images that are not ready (400)', async () => {
    vi.clearAllMocks()
    repoStub.getSheetForSub.mockResolvedValue(sheet)
    repoStub.getImageForSub.mockResolvedValue({ entityId: 'img-1', status: 'pending' })
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1', {
      method: 'PATCH',
      body: JSON.stringify({ images: ['img-1'] }),
    })
    expect(res.status).toBe(400)
    expect(envelope(await json(res)).code).toBe('INVALID_REQUEST')
    expect(repoStub.updateSheet).not.toHaveBeenCalled()
  })

  it('rejects PATCH images with more than 63 entries (schema)', async () => {
    vi.clearAllMocks()
    const app = createApp()
    const res = await authedRequest(app, '/sheets/sheet-1', {
      method: 'PATCH',
      body: JSON.stringify({ images: Array.from({ length: 64 }, (_, i) => `img-${i}`) }),
    })
    expect(res.status).toBe(400)
    expect(envelope(await json(res)).code).toBe('VALIDATION_ERROR')
    expect(repoStub.getImageForSub).not.toHaveBeenCalled()
    expect(repoStub.updateSheet).not.toHaveBeenCalled()
  })
})

describe('error envelope hygiene', () => {
  it('never leaks stack traces', async () => {
    vi.clearAllMocks()
    repoStub.getProfile.mockRejectedValue(new Error('dynamodb exploded: internal details'))
    repoStub.ensureDefaultSheet.mockResolvedValue(undefined)
    repoStub.listSheets.mockResolvedValue([])
    const app = createApp()
    const res = await authedRequest(app, '/me')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('dynamodb exploded')
    expect(text).not.toContain('stack')
    expect(envelope(JSON.parse(text)).code).toBe('INTERNAL_ERROR')
  })
})
