// Buy credits: the source page shell with the checkout container disabled in
// v1. No Stripe.js, publishable key, or checkout network request is made.

import './BuyCredits.css'

export default function BuyCredits() {
  return (
    <div className="buy-credits-page">
      <h1>Buy Credits</h1>

      <div id="checkout-container">
        <p className="checkout-disabled">Credit purchasing is coming soon.</p>
      </div>
    </div>
  )
}
