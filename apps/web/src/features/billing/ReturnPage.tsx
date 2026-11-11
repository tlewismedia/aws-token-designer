// Checkout return page (FR-14). Fulfillment status lands in Phase 4; the
// route is protected so ownership is verified by then.

import { useSearchParams } from 'react-router-dom'

export default function ReturnPage() {
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')
  return (
    <main className="placeholder-page">
      <h1>Order status</h1>
      <p>Payment processing arrives in Phase 4.</p>
      {sessionId && <p className="form-note">Checkout session: {sessionId}</p>}
      <p>
        Questions? <a href="mailto:orders@example.com">orders@example.com</a>
      </p>
    </main>
  )
}
