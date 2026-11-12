// Checkout return page (FR-12). Ported from the source `#success` section,
// with the port's ownership checks and polling:
//
// - `succeeded`            -> fulfilled (source "payment received" copy)
// - `pending`              -> payment received, credits still processing
// - `failed`               -> fulfillment_failed
// - 403/404/missing id     -> unknown order (never exposes payment data)
// - anything else          -> retryable error
//
// The source session's `open` and `expired` states do not exist here: the
// status endpoint only reports the payment record it created. Purchases stay
// disabled in v1, so an `open` session is not reachable.

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

function RefreshButton({
  isFetching,
  onClick,
}: {
  isFetching: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="btn" onClick={onClick} disabled={isFetching}>
      {isFetching ? 'Refreshing…' : 'Refresh'}
    </button>
  )
}

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

  return (
    <section id="success" aria-live="polite">
      {state === 'loading' && <p>Checking payment status...</p>}

      {state === 'fulfilled' && (
        <p>
          Payment received and credits have been applied. A confirmation email will be
          sent to you. If you have any questions, please email{' '}
          <a href="mailto:orders@example.com">orders@example.com</a>.
        </p>
      )}

      {state === 'pending' && (
        <>
          <p>
            Payment received. We are still processing your credits. If this does not
            complete shortly, please email{' '}
            <a href="mailto:orders@example.com">orders@example.com</a>.
          </p>
          <RefreshButton
            isFetching={query.isFetching}
            onClick={() => void query.refetch()}
          />
        </>
      )}

      {state === 'fulfillment_failed' && (
        <p>
          Payment was received, but we could not apply your credits automatically.
          Please contact <a href="mailto:orders@example.com">orders@example.com</a> so
          we can resolve this quickly.
        </p>
      )}

      {state === 'unknown' && (
        <p>
          {sessionId
            ? 'We could not find that order. If you think this is a mistake, please email '
            : 'This page needs a checkout session id. If you think this is a mistake, please email '}
          <a href="mailto:orders@example.com">orders@example.com</a>.
        </p>
      )}

      {state === 'error' && (
        <>
          <p>
            We could not check this order right now. Please try again or email{' '}
            <a href="mailto:orders@example.com">orders@example.com</a>.
          </p>
          <RefreshButton
            isFetching={query.isFetching}
            onClick={() => void query.refetch()}
          />
        </>
      )}
    </section>
  )
}
