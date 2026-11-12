// Stability client unit tests: request shape, auth headers, multipart fields,
// and PNG validation before bytes reach sharp. `fetch` is stubbed globally.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateStabilityImage,
  StabilityError,
  StabilityModerationError,
  STABILITY_ULTRA_URL,
} from '../src/lib/stability.js'

/** Minimal valid PNG signature (sniffImageType needs >= 12 bytes). */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
])

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function lastInit(): RequestInit {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  return call[1] as RequestInit
}

function lastForm(): FormData {
  return lastInit().body as FormData
}

describe('generateStabilityImage', () => {
  it('posts multipart fields to the ultra endpoint with bearer auth', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(PNG_BYTES), { status: 200 }))

    const result = await generateStabilityImage({
      apiKey: 'sk-test-key',
      prompt: 'A goblin chief',
      negativePrompt: 'blurry, extra limbs',
      style: 'anime',
    })

    expect(result.equals(PNG_BYTES)).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe(STABILITY_ULTRA_URL)
    expect(STABILITY_ULTRA_URL).toBe(
      'https://api.stability.ai/v2beta/stable-image/generate/ultra',
    )

    const init = lastInit()
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-test-key',
      Accept: 'image/*',
    })

    const form = lastForm()
    expect(form.get('prompt')).toBe('A goblin chief')
    expect(form.get('negative_prompt')).toBe('blurry, extra limbs')
    expect(form.get('aspect_ratio')).toBe('1:1')
    expect(form.get('output_format')).toBe('png')
    expect(form.get('style_preset')).toBe('anime')
  })

  it('omits optional fields when not provided', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(PNG_BYTES), { status: 200 }))

    await generateStabilityImage({ apiKey: 'sk-test-key', prompt: 'A goblin chief' })

    const form = lastForm()
    expect(form.get('negative_prompt')).toBeNull()
    expect(form.get('style_preset')).toBeNull()
  })

  it('throws a typed error for non-2xx responses', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }))

    await expect(
      generateStabilityImage({ apiKey: 'bad-key', prompt: 'A goblin chief' }),
    ).rejects.toBeInstanceOf(StabilityError)
    await expect(
      generateStabilityImage({ apiKey: 'bad-key', prompt: 'A goblin chief' }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('classifies a content-moderation rejection distinctly', async () => {
    fetchMock.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          errors: ['Your request was flagged by our content moderation system'],
          name: 'content_moderation',
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
    )

    await expect(
      generateStabilityImage({ apiKey: 'key', prompt: 'rejected prompt' }),
    ).rejects.toBeInstanceOf(StabilityModerationError)
    await expect(
      generateStabilityImage({ apiKey: 'key', prompt: 'rejected prompt' }),
    ).rejects.toMatchObject({ status: 403, name: 'StabilityModerationError' })
  })

  it('rejects an HTML body served with a 200', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><body>rate limited</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )

    await expect(
      generateStabilityImage({ apiKey: 'sk-test-key', prompt: 'A goblin chief' }),
    ).rejects.toBeInstanceOf(StabilityError)
  })

  it('rejects an empty 200 body', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array(), { status: 200 }))

    await expect(
      generateStabilityImage({ apiKey: 'sk-test-key', prompt: 'A goblin chief' }),
    ).rejects.toBeInstanceOf(StabilityError)
  })

  it('rejects a non-PNG image body (we requested PNG)', async () => {
    // JPEG magic bytes: sniffable, but not the requested format.
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
    fetchMock.mockResolvedValue(new Response(new Uint8Array(jpeg), { status: 200 }))

    await expect(
      generateStabilityImage({ apiKey: 'sk-test-key', prompt: 'A goblin chief' }),
    ).rejects.toBeInstanceOf(StabilityError)
  })

  it('wraps network failures as a typed error', async () => {
    fetchMock.mockRejectedValue(new Error('connection reset'))

    await expect(
      generateStabilityImage({ apiKey: 'sk-test-key', prompt: 'A goblin chief' }),
    ).rejects.toMatchObject({ name: 'StabilityError', status: 0 })
  })
})
