// Auth + request-id middleware. The Cognito JWT authorizer on API Gateway
// validates the token; the Lambda trusts the resulting claims (PLAN 8.1).

import type { MiddlewareHandler } from 'hono'
import { randomUUID } from 'node:crypto'
import { unauthorized } from './errors.js'

export interface JwtClaims {
  sub: string
  email: string
}

/** Minimal HTTP API v2 event surface used for claim extraction. */
export interface ApiGatewayV2EventLike {
  requestContext?: {
    requestId?: string
    authorizer?: {
      jwt?: {
        claims?: Record<string, string | number | boolean | string[] | undefined>
      }
    }
  }
}

type EnvWithEvent = { event?: ApiGatewayV2EventLike }

/** Extract Cognito claims from the HTTP API v2 event (defense in depth). */
export function getClaims(c: { env: unknown }): JwtClaims | null {
  const env = c.env as EnvWithEvent | undefined
  const event = env?.event
  const claims = event?.requestContext?.authorizer?.jwt?.claims
  const sub = typeof claims?.sub === 'string' ? claims.sub : undefined
  if (!sub) return null
  const email = typeof claims?.email === 'string' ? claims.email : ''
  return { sub, email }
}

/** Require an authenticated user; sets `sub`/`email` context variables. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const claims = getClaims(c)
  if (!claims) {
    throw unauthorized()
  }
  c.set('sub', claims.sub)
  c.set('email', claims.email)
  await next()
}

/** Resolve a request id: API Gateway's id, falling back to a random UUID. */
export function getRequestId(c: { env: unknown }): string {
  const env = c.env as EnvWithEvent | undefined
  return env?.event?.requestContext?.requestId ?? randomUUID()
}
