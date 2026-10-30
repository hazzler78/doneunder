# Billing (Stripe)

Payments are taken by **4 Days AI AB** on a dedicated Stripe account for Done Under.

## Plans

| Plan | Stripe | Access |
|---|---|---|
| One search, USD 190 excl. VAT | Checkout `mode=payment`, price `STRIPE_PRICE_ONE_TIME` | One row in `search_entitlements`; exactly one search usable within 30 days of payment. That search token, its reveal and the revealed diver's full CV stay valid until the same `expires_at`. Not consumed by a search with zero matches. A full refund (`charge.refunded`) revokes it. |
| Unlimited, USD 250/month excl. VAT | Checkout `mode=subscription`, price `STRIPE_PRICE_MONTHLY` | `companies.subscription_status = 'active'`; fair use 20 searches/hour, 100/day (`search_divers`). |

Stripe Tax (`automatic_tax`), tax ID collection and required billing address are on for every Checkout Session.
Subscriptions are managed in the Stripe Customer Portal (`POST /api/stripe/portal`).

## Flow

1. `/pricing` posts `product=one_time|monthly` to `POST /api/stripe/checkout` (signed-in company only).
2. The route reuses or creates the Stripe Customer (`companies.stripe_customer_id`) and redirects (303) to Checkout.
3. Stripe calls `POST https://doneunder.ai/api/stripe/webhook` (custom domain; Vercel SSO blocks preview URLs).
4. The webhook verifies the signature, logs the event id in `stripe_events` (idempotency) and:
   - `checkout.session.completed` / `checkout.session.async_payment_succeeded`: payment → insert entitlement (unique per session); subscription → sync.
   - `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`: re-read the subscription from Stripe and mirror status, period end and cancel flag onto `companies`.
   - `charge.refunded` (full refund): revoke the one-time entitlement.
5. Access is decided in SQL (migration `022_billing.sql`): `search_divers`, `reveal_match`, `company_has_cv_access`, `company_billing_status`.

## Status mapping

Stripe `active`/`trialing` → `active`; `past_due` → `past_due` (no access, UI asks for a card update); everything else → `inactive`.

## Local testing

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints whsec_... for .env.local
npm run dev
```

Test card `4242 4242 4242 4242`, any future date and CVC. Failing renewal: `4000 0000 0000 0341`.
