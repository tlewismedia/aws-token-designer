// Runtime configuration for the api Lambda. Read per call so tests can stub
// process.env without re-importing modules.

import { DEFAULT_CREDITS_PER_PURCHASE } from '@aws-token-designer/shared'

export interface BillingConfig {
  /**
   * Non-secret Stripe price id. Empty string means billing is not configured:
   * checkout returns 503 BILLING_DISABLED while unrelated routes keep working.
   */
  priceId: string
  /** SSM SecureString NAME holding the Stripe secret key (value out-of-band). */
  secretParamName: string
  /** SSM SecureString NAME holding the webhook signing secret. */
  webhookSecretParamName: string
  /** SPA origin used to build the embedded Checkout return URL. */
  webOrigin: string
  /** Server-controlled credits granted by one completed purchase. */
  creditsPerPurchase: number
}

export interface ApiConfig {
  tableName: string
  mediaBucket: string
  /** Presigned PUT lifetime (seconds). */
  uploadUrlTtl: number
  /** Presigned GET lifetime (seconds), PLAN 6.6: 1 hour. */
  getUrlTtl: number
  billing: BillingConfig
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export function config(): ApiConfig {
  const tableName = process.env.TABLE_NAME
  const mediaBucket = process.env.MEDIA_BUCKET
  if (!tableName) {
    throw new Error('TABLE_NAME is not set')
  }
  if (!mediaBucket) {
    throw new Error('MEDIA_BUCKET is not set')
  }
  return {
    tableName,
    mediaBucket,
    uploadUrlTtl: 900,
    getUrlTtl: Number(process.env.PRESIGN_TTL ?? 3600),
    billing: {
      // Terraform sets the names/id; values live in SSM (PLAN 7.5).
      priceId: process.env.STRIPE_PRICE_ID ?? '',
      secretParamName: process.env.STRIPE_SECRET_PARAM_NAME ?? '',
      webhookSecretParamName: process.env.STRIPE_WEBHOOK_SECRET_PARAM_NAME ?? '',
      webOrigin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, ''),
      creditsPerPurchase: positiveInt(
        process.env.CREDITS_PER_PURCHASE,
        DEFAULT_CREDITS_PER_PURCHASE,
      ),
    },
  }
}
