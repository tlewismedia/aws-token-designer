// Stripe webhook (PLAN 6.4/6.8, ADR-0007).
//
// Registered on the execute-api URL WITHOUT the Cognito authorizer and before
// the `requireAuth` middleware, exactly like /health. The handler verifies the
// signature over the raw request body, then fulfills the pending PAYMENT and
// grants credits in one idempotent DynamoDB transaction.
//
// Status contract:
//   - 400 missing/invalid signature (generic envelope; never the reason)
//   - 503 billing/webhook secret not configured yet (Stripe retries)
//   - 500 transient DynamoDB/SSM failure (Stripe retries)
//   - 200 success, replay/no-op, or irrelevant event

import type Stripe from 'stripe'
import type { App } from '../app.js'
import { config } from '../env.js'
import { getRepo } from '../lib/db.js'
import { ApiError, badRequest } from '../lib/errors.js'
import { constructStripeEvent, getStripeWebhookSecret } from '../lib/stripe.js'

const FULFILLING_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
])

function logError(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'error', component: 'stripeWebhook', ...fields }))
}

export function registerWebhookRoutes(app: App): void {
  app.post('/webhooks/stripe', async (c) => {
    const requestId = c.get('requestId')
    const billing = config().billing

    if (!billing.webhookSecretParamName) {
      // Not configured yet: a non-2xx makes Stripe retry after an operator
      // creates the SSM parameter. Unrelated routes are unaffected.
      throw new ApiError(503, 'BILLING_DISABLED', 'Billing is not configured')
    }

    const signature = c.req.header('stripe-signature')
    if (!signature) throw badRequest('Missing Stripe signature')

    const webhookSecret = await getStripeWebhookSecret(billing.webhookSecretParamName)
    if (!webhookSecret) {
      throw new ApiError(503, 'BILLING_DISABLED', 'Billing is not configured')
    }

    // Verify against the bytes exactly as received. `c.req.text()` does not
    // parse JSON, so Stripe's signature check sees the original payload.
    let event: Stripe.Event
    try {
      event = constructStripeEvent(await c.req.text(), signature, webhookSecret)
    } catch {
      throw new ApiError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature')
    }

    if (!FULFILLING_EVENTS.has(event.type)) {
      return c.json({ received: true })
    }

    const session = event.data.object as Stripe.Checkout.Session
    if (session.payment_status !== 'paid') {
      // Async payment methods can send completed before the money settles.
      return c.json({ received: true })
    }

    const repo = getRepo()
    const payment = await repo.getPayment(session.id)
    if (!payment) {
      // Unknown session: ack so Stripe does not retry forever.
      logError({ requestId, message: 'payment not found; ignoring event', eventId: event.id })
      return c.json({ received: true })
    }

    if (session.metadata?.sub !== payment.userId) {
      // Never grant on a metadata/owner mismatch. Acknowledge to stop retries
      // and leave a loud log for investigation.
      logError({
        requestId,
        message: 'payment metadata owner mismatch; refusing fulfillment',
        eventId: event.id,
        sessionId: session.id,
      })
      return c.json({ received: true })
    }

    await repo.fulfillPayment({
      sessionId: session.id,
      userId: payment.userId,
      eventId: event.id,
      credits: payment.creditsToGrant,
    })

    return c.json({ received: true })
  })
}
