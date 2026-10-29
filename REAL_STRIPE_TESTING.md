# Real Stripe test-mode checkout

Configure these server-side environment variables:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:5173/library?checkout=success
STRIPE_CHECKOUT_CANCEL_URL=http://localhost:5173/checkout/cancel
```

Start the API with those variables, then forward Stripe Checkout and Refund events to the local webhook:

```sh
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,refund.created,refund.updated,refund.failed \
  --forward-to localhost:3000/api/v1/webhooks/stripe
```

Copy the `whsec_...` value printed by `stripe listen` into `STRIPE_WEBHOOK_SECRET`, then restart the API. Use a Stripe test-mode secret only; the server rejects live secret keys. In Stripe Dashboard, configure Tax settings and add the business's confirmed tax registrations before expecting automatic tax to be calculated. Stripe may silently calculate zero tax when no active registration applies. This guide is for test-mode integration and does not verify tax registrations or determine tax obligations.

## Test-mode full refund

1. Complete a Checkout Session with test card `4242 4242 4242 4242`.
2. Open `/admin`, switch to the records tab, and approve the complaint.
3. Confirm the API response and the dashboard show the refund as succeeded.
4. Confirm the original order is `refunded`, its entitlement is `revoked`, and the refund appears in `transactions` with `type='refund'`.
5. Replay the same Stripe event or repeat the approval. The API must return a duplicate/idempotent response and must not create a second refund transaction.

M3 supports full-order refunds only. The refund amount is the original payment subtotal plus the tax snapshot recorded at fulfillment. Refunds require a USD order and a successful Stripe PaymentIntent.
