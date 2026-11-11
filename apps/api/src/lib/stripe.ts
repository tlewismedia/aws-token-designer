// Lazy Stripe client + webhook signature verification (PLAN 6.8).
//
// The secret key is read from SSM SecureString at request time and cached for
// the warm invocation. The module never constructs a client at import: an
// unconfigured deployment must keep every unrelated route working (checkout
// answers 503 BILLING_DISABLED instead). Secrets are never logged.

import Stripe from 'stripe'
import { getParameter } from './ssm.js'

let cachedClient: { secret: string; client: Stripe } | null = null
const secretCache = new Map<string, string>()

/** Test hook: clear the warm-invocation caches. */
export function resetStripeForTests(): void {
  cachedClient = null
  secretCache.clear()
}

async function readSecret(paramName: string): Promise<string | null> {
  const cached = secretCache.get(paramName)
  if (cached) return cached
  const value = await getParameter(paramName, true)
  if (value) secretCache.set(paramName, value)
  return value
}

/**
 * Resolve a Stripe client for the given SSM parameter name, or null when the
 * parameter is missing. The client is recreated only when the secret changes
 * (for example after a key rotation and a fresh Lambda environment).
 */
export async function getStripeClient(secretParamName: string): Promise<Stripe | null> {
  const secret = await readSecret(secretParamName)
  if (!secret) return null
  if (!cachedClient || cachedClient.secret !== secret) {
    cachedClient = { secret, client: new Stripe(secret) }
  }
  return cachedClient.client
}

/** Webhook signing secret from SSM SecureString, or null when absent. */
export async function getStripeWebhookSecret(paramName: string): Promise<string | null> {
  return readSecret(paramName)
}

/**
 * Verify a webhook against the exact raw request body. Throws on a missing or
 * invalid signature; callers map that to a generic 400 (never the reason).
 */
export function constructStripeEvent(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signatureHeader, secret)
}
