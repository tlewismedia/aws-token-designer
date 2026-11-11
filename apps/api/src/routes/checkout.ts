// Checkout routes (PLAN 6.4/6.8, FR-12):
//   POST /checkout/session      -> create embedded Stripe session + pending PAYMENT
//   GET  /checkout/session/{id} -> status for the owning caller only
//
// Identity comes strictly from the JWT (never the request body). The purchase
// UI stays disabled in v1; this backend is ready for later enablement.

import type Stripe from 'stripe'
import type {
  CheckoutSessionResponse,
  CheckoutSessionStatusResponse,
  Payment,
} from '@aws-token-designer/shared'
import type { App } from '../app.js'
import { config } from '../env.js'
import { getRepo } from '../lib/db.js'
import { billingDisabled, internalError } from '../lib/errors.js'
import { getStripeClient } from '../lib/stripe.js'

/** Safe log helper: never includes payloads, keys, or Stripe error bodies. */
function logError(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'error', component: 'checkout', ...fields }))
}

export function registerCheckoutRoutes(app: App): void {
  app.post('/checkout/session', async (c) => {
    const sub = c.get('sub')
    const email = c.get('email')
    const requestId = c.get('requestId')
    const billing = config().billing

    // Incomplete Stripe config: fail closed without creating any record.
    if (!billing.priceId || !billing.secretParamName) {
      throw billingDisabled()
    }

    const stripe = await getStripeClient(billing.secretParamName)
    if (!stripe) throw billingDisabled()

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.create({
        ui_mode: 'embedded',
        mode: 'payment',
        line_items: [{ price: billing.priceId, quantity: 1 }],
        return_url: `${billing.webOrigin}/return?session_id={CHECKOUT_SESSION_ID}`,
        client_reference_id: sub,
        metadata: { sub, credits: String(billing.creditsPerPurchase) },
        ...(email ? { customer_email: email } : {}),
      })
    } catch (err) {
      // Do not propagate Stripe's message (it can contain request details).
      logError({
        requestId,
        message: 'failed to create Stripe checkout session',
        errorName: err instanceof Error ? err.name : 'unknown',
      })
      throw internalError('Could not start checkout')
    }

    if (!session.id || !session.client_secret) {
      logError({ requestId, message: 'Stripe session missing id or client_secret' })
      throw internalError('Could not start checkout')
    }

    const now = new Date().toISOString()
    const payment: Payment = {
      id: session.id,
      userId: sub,
      status: 'pending',
      creditsGranted: 0,
      creditsToGrant: billing.creditsPerPurchase,
      amountTotal: session.amount_total ?? 0,
      processedEventIds: [],
      createdAt: now,
      updatedAt: now,
    }

    try {
      await getRepo().putPayment(payment)
    } catch (err) {
      // The Stripe session now exists but has no PAYMENT record. Log its id so
      // an operator can reconcile/refund it; never log secret material.
      logError({
        requestId,
        message: 'checkout session orphaned: payment write failed',
        sessionId: session.id,
        errorName: err instanceof Error ? err.name : 'unknown',
      })
      throw internalError('Could not start checkout')
    }

    const body: CheckoutSessionResponse = {
      sessionId: session.id,
      clientSecret: session.client_secret,
    }
    return c.json(body, 201)
  })

  app.get('/checkout/session/:id', async (c) => {
    // Direct key lookup is unique; the byId GSI is intentionally not used.
    const payment = await getRepo().getPaymentForSub(c.get('sub'), c.req.param('id'))
    const body: CheckoutSessionStatusResponse = {
      status: payment.status,
      creditsGranted: payment.creditsGranted ?? 0,
    }
    return c.json(body)
  })
}
