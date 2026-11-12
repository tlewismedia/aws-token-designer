// Payments route tests (PLAN 6.8, FR-12): checkout creation, ownership-checked
// status, and raw-body webhook verification + idempotent fulfillment.
//
// The Stripe SDK is real for webhook signature verification
// (`generateTestHeaderString` / `constructEvent`), while the client factory and
// SSM read are stubbed; DynamoDB is a repo stub. The production-shaped DynamoDB
// transaction is covered in repo.integration.test.ts against DynamoDB Local.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

process.env.TABLE_NAME = 'test-table'
process.env.MEDIA_BUCKET = 'test-bucket'
process.env.STRIPE_PRICE_ID = 'price_test_123'
process.env.STRIPE_SECRET_PARAM_NAME = '/token-designer/test/stripe/secret'
process.env.STRIPE_WEBHOOK_SECRET_PARAM_NAME = '/token-designer/test/stripe/webhook-secret'
process.env.WEB_ORIGIN = 'http://localhost:5173'
process.env.CREDITS_PER_PURCHASE = '10'

const WEBHOOK_SECRET = 'whsec_test_secret_123'

const repoStub = vi.hoisted(() => ({
  putPayment: vi.fn(),
  getPayment: vi.fn(),
  getPaymentForSub: vi.fn(),
  fulfillPayment: vi.fn(),
}))

vi.mock('../src/lib/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/db.js')>()
  return { ...actual, getRepo: () => repoStub }
})

const stripeMocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  getStripeWebhookSecret: vi.fn(),
}))

vi.mock('../src/lib/stripe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/stripe.js')>()
  return {
    ...actual,
    getStripeClient: stripeMocks.getStripeClient,
    getStripeWebhookSecret: stripeMocks.getStripeWebhookSecret,
  }
})

import { createApp } from '../src/app.js'
import { handler } from '../src/index.js'
import { forbidden, notFound } from '../src/lib/errors.js'

const claimsEvent = (sub = 'user-1', email = 'user-1@example.com') => ({
  event: {
    requestContext: {
      requestId: 'req-123',
      authorizer: { jwt: { claims: { sub, email } } },
    },
  },
})

function authedRequest(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: RequestInit,
) {
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

const checkoutCreate = vi.fn()
const stripeClient = {
  checkout: { sessions: { create: checkoutCreate } },
}

const sessionFixture = {
  id: 'cs_test_1',
  client_secret: 'cs_test_1_secret_abc',
  amount_total: 500,
}

function paymentItem(overrides: Record<string, unknown> = {}) {
  return {
    PK: 'PAYMENT#cs_test_1',
    SK: 'PAYMENT',
    userId: 'user-1',
    status: 'pending',
    creditsGranted: 0,
    creditsToGrant: 10,
    amountTotal: 500,
    processedEventIds: [] as string[],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

interface CheckoutEventOptions {
  eventId?: string
  sessionId?: string
  sub?: string
  paymentStatus?: string
  type?: string
}

function checkoutEvent(options: CheckoutEventOptions = {}) {
  return {
    id: options.eventId ?? 'evt_1',
    object: 'event',
    type: options.type ?? 'checkout.session.completed',
    data: {
      object: {
        id: options.sessionId ?? 'cs_test_1',
        object: 'checkout.session',
        payment_status: options.paymentStatus ?? 'paid',
        metadata: { sub: options.sub ?? 'user-1', credits: '10' },
      },
    },
  }
}

function signedWebhook(event: unknown) {
  const payload = JSON.stringify(event)
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  })
  return { payload, signature }
}

function postWebhook(
  app: ReturnType<typeof createApp>,
  payload: string,
  signature?: string,
) {
  return app.request('/webhooks/stripe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'stripe-signature': signature } : {}),
    },
    body: payload,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_PRICE_ID = 'price_test_123'
  process.env.STRIPE_SECRET_PARAM_NAME = '/token-designer/test/stripe/secret'
  process.env.STRIPE_WEBHOOK_SECRET_PARAM_NAME =
    '/token-designer/test/stripe/webhook-secret'
  process.env.WEB_ORIGIN = 'http://localhost:5173'
  process.env.CREDITS_PER_PURCHASE = '10'

  checkoutCreate.mockResolvedValue(sessionFixture)
  stripeMocks.getStripeClient.mockResolvedValue(stripeClient)
  stripeMocks.getStripeWebhookSecret.mockResolvedValue(WEBHOOK_SECRET)
  repoStub.putPayment.mockResolvedValue(undefined)
  repoStub.getPayment.mockResolvedValue(paymentItem())
  repoStub.fulfillPayment.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /checkout/session', () => {
  it('creates an embedded session and a pending payment from JWT identity', async () => {
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session', {
      method: 'POST',
      // Identity/credits in the body must be ignored.
      body: JSON.stringify({ userId: 'attacker', credits: 9999 }),
    })

    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({
      sessionId: 'cs_test_1',
      clientSecret: 'cs_test_1_secret_abc',
    })

    expect(checkoutCreate).toHaveBeenCalledTimes(1)
    expect(checkoutCreate).toHaveBeenCalledWith({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items: [{ price: 'price_test_123', quantity: 1 }],
      return_url: 'http://localhost:5173/return?session_id={CHECKOUT_SESSION_ID}',
      client_reference_id: 'user-1',
      metadata: { sub: 'user-1', credits: '10' },
      customer_email: 'user-1@example.com',
    })

    expect(repoStub.putPayment).toHaveBeenCalledTimes(1)
    expect(repoStub.putPayment.mock.calls[0][0]).toMatchObject({
      id: 'cs_test_1',
      userId: 'user-1',
      status: 'pending',
      creditsGranted: 0,
      creditsToGrant: 10,
      amountTotal: 500,
      processedEventIds: [],
    })
  })

  it('returns 503 BILLING_DISABLED when the price/secret config is incomplete', async () => {
    process.env.STRIPE_PRICE_ID = ''
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session', { method: 'POST' })

    expect(res.status).toBe(503)
    expect(envelope(await json(res)).code).toBe('BILLING_DISABLED')
    expect(checkoutCreate).not.toHaveBeenCalled()
    expect(repoStub.putPayment).not.toHaveBeenCalled()
  })

  it('returns 503 when the Stripe secret parameter is missing', async () => {
    stripeMocks.getStripeClient.mockResolvedValue(null)
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session', { method: 'POST' })

    expect(res.status).toBe(503)
    expect(envelope(await json(res)).code).toBe('BILLING_DISABLED')
    expect(repoStub.putPayment).not.toHaveBeenCalled()
  })

  it('returns a safe 500 on a Stripe failure and writes no payment', async () => {
    checkoutCreate.mockRejectedValue(new Error('Stripe says sk_test_leaked_key is bad'))
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session', { method: 'POST' })

    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('sk_test_leaked_key')
    expect(envelope(JSON.parse(text)).code).toBe('INTERNAL_ERROR')
    expect(repoStub.putPayment).not.toHaveBeenCalled()
  })

  it('logs the session id if Stripe succeeds but the payment write fails', async () => {
    repoStub.putPayment.mockRejectedValue(new Error('ddb unavailable'))
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session', { method: 'POST' })

    expect(res.status).toBe(500)
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('cs_test_1'),
    )
  })
})

describe('GET /checkout/session/{id}', () => {
  it('returns only status + credits for the owner', async () => {
    repoStub.getPaymentForSub.mockResolvedValue(
      paymentItem({ status: 'succeeded', creditsGranted: 10, processedEventIds: ['evt_1'] }),
    )
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session/cs_test_1')

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ status: 'succeeded', creditsGranted: 10 })
    expect(repoStub.getPaymentForSub).toHaveBeenCalledWith('user-1', 'cs_test_1')
  })

  it('returns 403 for another user\u2019s payment, never data', async () => {
    repoStub.getPaymentForSub.mockRejectedValue(forbidden('Payment belongs to another user'))
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session/cs_test_1')

    expect(res.status).toBe(403)
    const body = await json(res)
    expect(envelope(body).code).toBe('FORBIDDEN')
    expect(JSON.stringify(body)).not.toContain('creditsGranted')
  })

  it('returns 404 for a missing payment', async () => {
    repoStub.getPaymentForSub.mockRejectedValue(notFound('Payment not found'))
    const app = createApp()
    const res = await authedRequest(app, '/checkout/session/missing')

    expect(res.status).toBe(404)
    expect(envelope(await json(res)).code).toBe('NOT_FOUND')
  })
})

/** API Gateway HTTP API v2 event with the stage-prefixed path. */
function apiGatewayWebhookEvent(payload: string, signature: string) {
  return {
    version: '2.0',
    routeKey: 'POST /webhooks/stripe',
    rawPath: '/api/webhooks/stripe',
    rawQueryString: '',
    headers: {
      host: 'example.execute-api.us-west-2.amazonaws.com',
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'abc123',
      domainName: 'example.execute-api.us-west-2.amazonaws.com',
      http: {
        method: 'POST',
        path: '/api/webhooks/stripe',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'stripe-cli',
      },
      requestId: 'req-webhook',
      routeKey: 'POST /webhooks/stripe',
      stage: 'api',
      time: '2026-01-01T00:00:00Z',
      timeEpoch: 0,
    },
    body: payload,
    isBase64Encoded: false,
  }
}

describe('POST /webhooks/stripe', () => {
  it('is reachable without a JWT and fulfills a paid checkout once', async () => {
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent())
    // No claims event: if the route were behind requireAuth this would be 401.
    const res = await postWebhook(app, payload, signature)

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ received: true })
    expect(repoStub.fulfillPayment).toHaveBeenCalledTimes(1)
    expect(repoStub.fulfillPayment).toHaveBeenCalledWith({
      sessionId: 'cs_test_1',
      userId: 'user-1',
      eventId: 'evt_1',
      credits: 10,
    })
  })

  it('verifies the raw body through the API Gateway v2 Lambda adapter', async () => {
    const { payload, signature } = signedWebhook(checkoutEvent())
    const res = (await handler(
      apiGatewayWebhookEvent(payload, signature) as never,
      {} as never,
    )) as { statusCode: number; body: string }

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ received: true })
    expect(repoStub.fulfillPayment).toHaveBeenCalledTimes(1)
  })

  it('handles checkout.session.async_payment_succeeded', async () => {
    const app = createApp()
    const { payload, signature } = signedWebhook(
      checkoutEvent({ type: 'checkout.session.async_payment_succeeded' }),
    )
    const res = await postWebhook(app, payload, signature)

    expect(res.status).toBe(200)
    expect(repoStub.fulfillPayment).toHaveBeenCalledTimes(1)
  })

  it('returns 200 and no-ops on a replayed event (DB conditional cancellation)', async () => {
    repoStub.fulfillPayment.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent())

    const first = await postWebhook(app, payload, signature)
    const replay = await postWebhook(app, payload, signature)

    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(repoStub.fulfillPayment).toHaveBeenCalledTimes(2)
  })

  it('returns 400 for a bad signature without touching the payment', async () => {
    const app = createApp()
    const { payload } = signedWebhook(checkoutEvent())
    const badSignature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_wrong_secret',
    })
    const res = await postWebhook(app, payload, badSignature)

    expect(res.status).toBe(400)
    expect(envelope(await json(res)).code).toBe('INVALID_SIGNATURE')
    expect(repoStub.getPayment).not.toHaveBeenCalled()
    expect(repoStub.fulfillPayment).not.toHaveBeenCalled()
  })

  it('returns 400 when the signature header is missing', async () => {
    const app = createApp()
    const { payload } = signedWebhook(checkoutEvent())
    const res = await postWebhook(app, payload)

    expect(res.status).toBe(400)
    expect(envelope(await json(res)).code).toBe('INVALID_REQUEST')
  })

  it('returns a safe 500 on a transient DB failure so Stripe retries', async () => {
    repoStub.fulfillPayment.mockRejectedValue(new Error('ProvisionedThroughputExceeded'))
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent())

    const res = await postWebhook(app, payload, signature)
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('ProvisionedThroughputExceeded')
    expect(envelope(JSON.parse(text)).code).toBe('INTERNAL_ERROR')
  })

  it('acknowledges irrelevant event types without reading the payment', async () => {
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent({ type: 'customer.created' }))
    const res = await postWebhook(app, payload, signature)

    expect(res.status).toBe(200)
    expect(repoStub.getPayment).not.toHaveBeenCalled()
    expect(repoStub.fulfillPayment).not.toHaveBeenCalled()
  })

  it('does not fulfill an unpaid checkout session', async () => {
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent({ paymentStatus: 'unpaid' }))
    const res = await postWebhook(app, payload, signature)

    expect(res.status).toBe(200)
    expect(repoStub.fulfillPayment).not.toHaveBeenCalled()
  })

  it('acknowledges an unknown session without granting credits', async () => {
    repoStub.getPayment.mockResolvedValue(null)
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent())
    const res = await postWebhook(app, payload, signature)

    expect(res.status).toBe(200)
    expect(repoStub.fulfillPayment).not.toHaveBeenCalled()
  })

  it('refuses fulfillment when metadata owner does not match the payment', async () => {
    repoStub.getPayment.mockResolvedValue(paymentItem({ userId: 'user-1' }))
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent({ sub: 'attacker' }))
    const res = await postWebhook(app, payload, signature)

    expect(res.status).toBe(200)
    expect(repoStub.fulfillPayment).not.toHaveBeenCalled()
  })

  it('returns 503 when the webhook secret parameter is not configured', async () => {
    process.env.STRIPE_WEBHOOK_SECRET_PARAM_NAME = ''
    const app = createApp()
    const { payload, signature } = signedWebhook(checkoutEvent())
    const res = await postWebhook(app, payload, signature)

    expect(res.status).toBe(503)
    expect(envelope(await json(res)).code).toBe('BILLING_DISABLED')
  })
})
