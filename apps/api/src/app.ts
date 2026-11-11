// Hono application for the api Lambda. `createApp()` is exported for tests;
// `index.ts` wires it to the Lambda handler via @hono/aws-lambda.

import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { getRequestId, requireAuth } from './lib/auth.js'
import { ApiError, internalError } from './lib/errors.js'
import { registerCheckoutRoutes } from './routes/checkout.js'
import { registerImagesRoutes } from './routes/images.js'
import { registerJobsRoutes } from './routes/jobs.js'
import { registerMeRoutes } from './routes/me.js'
import { registerSheetsRoutes } from './routes/sheets.js'
import { registerWebhookRoutes } from './routes/webhooks.js'
import type { ZodType, z } from 'zod'

export type AppEnv = {
  Variables: {
    requestId: string
    sub: string
    email: string
  }
}

export type App = Hono<AppEnv>

/** Parse and validate a JSON body, or throw a 400 with a safe message. */
export async function parseJsonBody<S extends ZodType>(
  c: { req: { json(): Promise<unknown> } },
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new ApiError(400, 'INVALID_REQUEST', 'Body must be valid JSON')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body failed validation')
  }
  return parsed.data as z.infer<S>
}

export interface AppOptions {
  /** Mount every route under this prefix (e.g. `/api`, the API Gateway stage). */
  basePath?: string
}

export function createApp(options: AppOptions = {}): App {
  // `basePath` returns a new router, so it must be applied at construction
  // (the chained form below) before any route or middleware is registered.
  const app = options.basePath
    ? new Hono<AppEnv>().basePath(options.basePath)
    : new Hono<AppEnv>()

  // Request-id middleware: every response and error carries an id that maps
  // back to the API Gateway request id (PLAN 8.4).
  app.use('*', async (c, next) => {
    const requestId = getRequestId(c)
    c.set('requestId', requestId)
    await next()
    c.header('x-request-id', requestId)
  })

  // Health check (unauthenticated, PLAN 6.4).
  app.get('/health', (c) => c.json({ status: 'ok' }))

  // Stripe webhook (unauthenticated, PLAN 6.4/6.8): must be registered before
  // the `requireAuth` middleware below. Signature verification is its auth.
  registerWebhookRoutes(app)

  app.onError((err, c) => {
    const requestId = c.get('requestId')
    if (err instanceof ApiError) {
      return c.json(
        { error: { code: err.code, message: err.message, requestId } },
        err.status as ContentfulStatusCode,
      )
    }
    // Log the real error with a request id; never leak it to the client.
    console.error(JSON.stringify({ level: 'error', requestId, message: err.message }))
    return c.json(
      { error: { code: internalError().code, message: 'Internal server error', requestId } },
      500,
    )
  })

  // Everything below requires a valid Cognito JWT (authorizer + this guard).
  app.use('*', requireAuth)

  registerMeRoutes(app)
  registerImagesRoutes(app)
  registerJobsRoutes(app)
  registerSheetsRoutes(app)
  registerCheckoutRoutes(app)

  return app
}
