import { describe, expect, it } from 'vitest'
import {
  addTokenRequestSchema,
  checkoutSessionResponseSchema,
  checkoutSessionStatusResponseSchema,
  errorEnvelopeSchema,
  generateImageRequestSchema,
  imageSchema,
  jobSchema,
  meResponseSchema,
  paymentSchema,
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

describe('generateImageRequestSchema', () => {
  it('accepts a prompt with optional negative prompt and style', () => {
    const parsed = generateImageRequestSchema.parse({
      prompt: 'A goblin chief',
      negativePrompt: 'blurry',
      style: 'anime',
    })
    expect(parsed.prompt).toBe('A goblin chief')
    expect(parsed.style).toBe('anime')
  })

  it('trims whitespace and rejects blank prompts', () => {
    expect(generateImageRequestSchema.parse({ prompt: '  wizard  ' }).prompt).toBe('wizard')
    expect(() => generateImageRequestSchema.parse({ prompt: '   ' })).toThrow()
    expect(() => generateImageRequestSchema.parse({})).toThrow()
  })

  it('rejects overlong prompts and unknown styles', () => {
    expect(() =>
      generateImageRequestSchema.parse({ prompt: 'a'.repeat(1001) }),
    ).toThrow()
    expect(() =>
      generateImageRequestSchema.parse({ prompt: 'x', style: 'impressionist' }),
    ).toThrow()
  })
})

describe('paymentSchema', () => {
  const pending = {
    id: 'cs_test_123',
    userId: 'user-1',
    status: 'pending',
    creditsGranted: 0,
    creditsToGrant: 10,
    amountTotal: 500,
    processedEventIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('accepts a pending payment and a fulfilled payment', () => {
    expect(paymentSchema.parse(pending).status).toBe('pending')
    const succeeded = paymentSchema.parse({
      ...pending,
      status: 'succeeded',
      creditsGranted: 10,
      processedEventIds: ['evt_1'],
    })
    expect(succeeded.creditsGranted).toBe(10)
    expect(succeeded.processedEventIds).toEqual(['evt_1'])
  })

  it('rejects unknown statuses and non-positive grants', () => {
    expect(() => paymentSchema.parse({ ...pending, status: 'refunded' })).toThrow()
    expect(() => paymentSchema.parse({ ...pending, creditsToGrant: 0 })).toThrow()
  })
})

describe('checkout response schemas', () => {
  it('validates the session creation response', () => {
    const parsed = checkoutSessionResponseSchema.parse({
      sessionId: 'cs_test_123',
      clientSecret: 'cs_test_123_secret_abc',
    })
    expect(parsed.clientSecret).toBe('cs_test_123_secret_abc')
  })

  it('validates the status response without ownership data', () => {
    const parsed = checkoutSessionStatusResponseSchema.parse({
      status: 'succeeded',
      creditsGranted: 10,
    })
    expect(parsed).toEqual({ status: 'succeeded', creditsGranted: 10 })
  })
})

describe('jobSchema', () => {
  it('accepts pending and terminal job records', () => {
    const pending = jobSchema.parse({
      id: 'job-1',
      sub: 'user-1',
      type: 'generation',
      status: 'pending',
      imageId: 'img-1',
      prompt: 'A goblin',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: 1767225600,
    })
    expect(pending.status).toBe('pending')

    const failed = jobSchema.parse({
      ...pending,
      status: 'failed',
      error: 'GENERATION_FAILED',
    })
    expect(failed.error).toBe('GENERATION_FAILED')
  })

  it('rejects unknown statuses and non-generation types', () => {
    const base = {
      id: 'job-1',
      sub: 'user-1',
      type: 'generation',
      status: 'queued',
      imageId: 'img-1',
      prompt: 'A goblin',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    expect(() => jobSchema.parse(base)).toThrow()
    expect(() => jobSchema.parse({ ...base, status: 'pending', type: 'upload' })).toThrow()
  })
})
