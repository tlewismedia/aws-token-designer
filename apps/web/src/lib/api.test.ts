// API client: attaches the Bearer token, surfaces the error envelope, and
// broadcasts the unauthorized event on 401 (PLAN 6.2, FR-1).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, UNAUTHORIZED_EVENT } from './api'

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(async () => ({
    tokens: { idToken: { toString: () => 'test-id-token' } },
  })),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('apiFetch', () => {
  it('sends the Authorization header and JSON content type', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ profile: { credits: 10 } }), { status: 200 }),
    )
    await apiFetch('/me', { method: 'POST', body: { a: 1 } })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-id-token')
    expect(headers['Content-Type']).toBe('application/json')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/me')
  })

  it('throws a typed error from the error envelope', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Request body failed validation', requestId: 'r' },
        }),
        { status: 400 },
      ),
    )
    await expect(apiFetch('/sheets', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request body failed validation',
    })
  })

  it('does not leak raw internals when the envelope is missing', async () => {
    fetchMock.mockResolvedValue(
      new Response('boom stack trace', { status: 500, headers: { 'content-type': 'text/html' } }),
    )
    try {
      await apiFetch('/images')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).message).toBe('Request failed')
      expect((err as ApiError).code).toBe('UNKNOWN')
      expect((err as Error).message).not.toContain('boom stack trace')
    }
  })

  it('dispatches the unauthorized event on 401', async () => {
    const listener = vi.fn()
    window.addEventListener(UNAUTHORIZED_EVENT, listener)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Session expired', requestId: 'r' } }),
        { status: 401 },
      ),
    )
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(UNAUTHORIZED_EVENT, listener)
  })

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(apiFetch('/images/abc', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
