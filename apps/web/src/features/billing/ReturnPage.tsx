// Checkout return page (FR-12). Shows the fulfillment state for a Stripe
// Checkout Session: fulfilled, pending (webhook still working), or failed.
// Ownership is verified by GET /checkout/session/{id}; a 403/404 is shown as
// an unknown order, never as payment data. Purchase UI stays disabled in v1.

import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../../lib/api'
import { useCheckoutStatus } from '../../hooks/useCheckout'

type PageState =
  | 'loading'
  | 'fulfilled'
  | 'pending'
  | 'fulfillment_failed'
  | 'unknown'
  | 'error'

export default function ReturnPage() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')
  const query = useCheckoutStatus(sessionId)

  const state: PageState = !sessionId
    ? 'unknown'
    : query.isPending
      ? 'loading'
      : query.isError
        ? query.error instanceof ApiError &&
          (query.error.status === 403 || query.error.status === 404)
          ? 'unknown'
          : 'error'
        : query.data?.status === 'succeeded'
          ? 'fulfilled'
          : query.data?.status === 'pending'
            ? 'pending'
            : 'fulfillment_failed'

  const credits = query.data?.creditsGranted ?? 0

  return (
    <main className="placeholder-page">
      <h1>Order status</h1>
      <div aria-live="polite" data-testid="checkout-status">
        {state === 'loading' && <p>Checking order status…</p>}

        {state === 'fulfilled' && (
          <p>
            Payment confirmed — {credits} credit{credits === 1 ? '' : 's'} added to
            your account.
          </p>
        )}

        {state === 'pending' && (
          <>
            <p>
              Payment received. Credits are being applied; this usually takes a few
              seconds.
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        )}

        {state === 'fulfillment_failed' && (
          <p>
            We received your payment but could not apply the credits. Please contact
            us so we can fix it.
          </p>
        )}

        {state === 'unknown' && (
          <p>
            {sessionId
              ? 'We could not find that order.'
              : 'This page needs a checkout session id.'}
          </p>
        )}

        {state === 'error' && (
          <>
            <p>We could not check this order right now.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        )}
      </div>
      <p>
        Questions? <a href="mailto:orders@example.com">orders@example.com</a>
      </p>
    </main>
  )
}
