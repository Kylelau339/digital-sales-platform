# Real Stripe test-mode checkout

Configure these server-side environment variables:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:5173/library?checkout=success
STRIPE_CHECKOUT_CANCEL_URL=http://localhost:5173/checkout/cancel
```

Start the API with those variables, then forward Stripe Checkout events to the local webhook:

```sh
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

Copy the `whsec_...` value printed by `stripe listen` into `STRIPE_WEBHOOK_SECRET`, then restart the API. Use a Stripe test-mode secret only; the server rejects live secret keys. In Stripe Dashboard, configure Tax settings and add the business's confirmed tax registrations before expecting automatic tax to be calculated. Stripe may silently calculate zero tax when no active registration applies. This guide is for test-mode integration and does not verify tax registrations or determine tax obligations.
