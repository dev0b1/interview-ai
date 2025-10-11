# Paddle Billing integration (example)

This project ships a feature-flagged example of Paddle Billing integration. It's optional: if you don't set `PADDLE_BILLING_API_KEY` (or install the SDK), the routes will return a friendly error.

Environment variables
- `PADDLE_BILLING_API_KEY` - (server) Paddle Billing API key (or `PADDLE_API_KEY` as fallback)
- `PADDLE_WEBHOOK_SECRET` - Webhook secret used to verify signing header
- `PADDLE_ENVIRONMENT` - `sandbox` or `production`
- `NEXT_PUBLIC_BASE_URL` - used to build the checkout success URL

Install (optional)

```
npm install @paddle/paddle-node-sdk
```

Routes added (feature-flagged)
- `POST /api/paddle-billing/checkout` - create a Billing transaction and return a checkout url
- `POST /api/paddle-billing/webhook` - webhook handler (verifies `paddle-signature` header using HMAC)
- `POST /api/paddle-billing/subscriptions/cancel` - cancel a subscription
- `GET /api/paddle-billing/subscriptions/[id]` - fetch subscription info

Notes
- This is a minimal example. The Billing SDK exposes richer shapes; inspect the object returned by the SDK and adapt mapping logic to your DB.
- Always verify webhooks in production. The example uses `PADDLE_WEBHOOK_SECRET` with HMAC sha256 verification.
- The helper `src/lib/paddleBilling.ts` dynamically imports the SDK and throws a clear error if it's not installed.
