// Stripe webhook fixtures (PLAN §9): real-shaped event payloads signed with the
// Stripe SDK, proving the raw-body + signature contract the webhook depends on.
//
// The route-level idempotency/ownership behaviour is covered in
// payments.test.ts and repo.integration.test.ts; this test keeps the checked-in
// fixtures honest (parseable, supported event types, correct metadata) and
// proves a tampered body is rejected.

import { readFileSync } from 'node:fs'
import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'

const WEBHOOK_SECRET = 'whsec_fixture_secret'

const FIXTURES = [
  'checkout.session.completed.json',
  'checkout.session.async_payment_succeeded.json',
] as const

function loadFixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/stripe/${name}`, import.meta.url),
    'utf-8',
  )
}

describe('Stripe webhook fixtures', () => {
  it.each(FIXTURES)('%s parses as a signed checkout event', (name) => {
    const raw = loadFixture(name)
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: WEBHOOK_SECRET,
    })

    const event = Stripe.webhooks.constructEvent(raw, header, WEBHOOK_SECRET)

    expect(event.object).toBe('event')
    expect(event.type).toMatch(/^checkout\.session\./)
    expect(event.livemode).toBe(false)

    const session = event.data.object as Stripe.Checkout.Session
    expect(session.object).toBe('checkout.session')
    expect(session.payment_status).toBe('paid')
    expect(session.status).toBe('complete')
    expect(session.metadata?.sub).toMatch(/^user-fixture-/)
    expect(session.metadata?.credits).toBe('10')
  })

  it('rejects a body that does not match the signature', () => {
    const raw = loadFixture(FIXTURES[0])
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: WEBHOOK_SECRET,
    })

    expect(() =>
      Stripe.webhooks.constructEvent(`${raw} `, header, WEBHOOK_SECRET),
    ).toThrow()
  })

  it('rejects a signature made with a different secret', () => {
    const raw = loadFixture(FIXTURES[0])
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: 'whsec_wrong_fixture_secret',
    })

    expect(() =>
      Stripe.webhooks.constructEvent(raw, header, WEBHOOK_SECRET),
    ).toThrow()
  })
})
