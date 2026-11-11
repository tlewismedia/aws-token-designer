// Typed fetch wrapper for the API (PLAN 6.2): attaches the Cognito ID token,
// parses the shared error envelope, and emits an unauthorized event on 401
// so the AuthContext can sign the user out.

import { fetchAuthSession } from 'aws-amplify/auth'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

/** Fired when the API answers 401; AuthContext listens and signs out. */
export const UNAUTHORIZED_EVENT = 'auth:unauthorized'

async function idToken(): Promise<string> {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired — please sign in again')
  }
  return token
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await idToken()}`,
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })

  if (res.status === 204) {
    return undefined as T
  }

  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired — please sign in again')
  }

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    if (!res.ok) {
      // Non-JSON failure (e.g. a proxy error page): generic safe message only.
      throw new ApiError(res.status, 'UNKNOWN', 'Request failed')
    }
    throw new ApiError(res.status, 'UNKNOWN', 'Response was not valid JSON')
  }

  if (!res.ok) {
    const envelope = payload as { error?: { code?: string; message?: string } }
    throw new ApiError(
      res.status,
      envelope.error?.code ?? 'UNKNOWN',
      envelope.error?.message ?? 'Request failed',
    )
  }
  return payload as T
}
