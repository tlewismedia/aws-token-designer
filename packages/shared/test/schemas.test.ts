import { describe, expect, it } from 'vitest'
import {
  addTokenRequestSchema,
  errorEnvelopeSchema,
  imageSchema,
  meResponseSchema,
  sheetSchema,
  uploadUrlRequestSchema,
} from '../src/index.js'

describe('uploadUrlRequestSchema', () => {
  it('accepts a valid png upload request', () => {
    const parsed = uploadUrlRequestSchema.parse({
      name: 'Goblin Chief',
      description: 'A big goblin',
      style: 'anime',
      contentType: 'image/png',
      size: 64000,
    })
    expect(parsed.name).toBe('Goblin Chief')
  })

  it('rejects unsupported content types', () => {
    expect(() =>
      uploadUrlRequestSchema.parse({ name: 'x', contentType: 'application/pdf' }),
    ).toThrow()
  })

  it('requires a positive integer size (presign Content-Length constraint)', () => {
    const parsed = uploadUrlRequestSchema.parse({
      name: 'x',
      contentType: 'image/png',
      size: 12345,
    })
    expect(parsed.size).toBe(12345)
    expect(() =>
      uploadUrlRequestSchema.parse({ name: 'x', contentType: 'image/png', size: 0 }),
    ).toThrow()
    expect(() =>
      uploadUrlRequestSchema.parse({ name: 'x', contentType: 'image/png', size: 10.5 }),
    ).toThrow()
    expect(() =>
      uploadUrlRequestSchema.parse({ name: 'x', contentType: 'image/png', size: -1 }),
    ).toThrow()
  })

  it('rejects missing names and overlong names', () => {
    expect(() => uploadUrlRequestSchema.parse({ name: '  ', contentType: 'image/png' })).toThrow()
    expect(() =>
      uploadUrlRequestSchema.parse({ name: 'a'.repeat(101), contentType: 'image/png' }),
    ).toThrow()
  })

  it('rejects invalid styles', () => {
    expect(() =>
      uploadUrlRequestSchema.parse({ name: 'x', style: 'impressionist', contentType: 'image/png' }),
    ).toThrow()
  })
})

describe('sheetSchema', () => {
  it('accepts a sheet with up to 63 tokens', () => {
    const sheet = sheetSchema.parse({
      id: '01JD',
      sub: 'sub-1',
      name: 'Default Sheet',
      template: 'default',
      images: Array.from({ length: 63 }, (_, i) => `img-${i}`),
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(sheet.images).toHaveLength(63)
  })

  it('rejects more than 63 tokens', () => {
    expect(() =>
      sheetSchema.parse({
        id: '01JD',
        sub: 'sub-1',
        name: 'Default Sheet',
        template: 'default',
        images: Array.from({ length: 64 }, (_, i) => `img-${i}`),
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow()
  })
})

describe('imageSchema', () => {
  it('round-trips a ready image', () => {
    const image = imageSchema.parse({
      id: '01JD',
      sub: 'sub-1',
      name: 'Wizard',
      status: 'ready',
      fullKey: 'users/sub-1/images/01JD/full.png',
      thumbKey: 'users/sub-1/images/01JD/thumb.png',
      contentType: 'image/png',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    expect(image.status).toBe('ready')
  })

  it('rejects unknown statuses', () => {
    expect(() =>
      imageSchema.parse({
        id: '01JD',
        sub: 'sub-1',
        name: 'Wizard',
        status: 'queued',
        fullKey: 'k',
        thumbKey: 'k',
        contentType: 'image/png',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow()
  })
})

describe('meResponseSchema', () => {
  it('validates profile + sheets payload', () => {
    const me = meResponseSchema.parse({
      profile: { sub: 's', email: 'a@b.com', credits: 10, createdAt: '2026-01-01T00:00:00.000Z' },
      sheets: [],
    })
    expect(me.profile.credits).toBe(10)
  })
})

describe('addTokenRequestSchema', () => {
  it('requires an imageId', () => {
    expect(() => addTokenRequestSchema.parse({})).toThrow()
    expect(addTokenRequestSchema.parse({ imageId: 'abc' }).imageId).toBe('abc')
  })
})

describe('errorEnvelopeSchema', () => {
  it('matches the documented shape', () => {
    const envelope = errorEnvelopeSchema.parse({
      error: { code: 'INVALID_REQUEST', message: 'Bad input', requestId: 'r-1' },
    })
    expect(envelope.error.requestId).toBe('r-1')
  })
})
