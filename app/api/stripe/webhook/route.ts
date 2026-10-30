import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { companyStatusFromStripe, oneTimeExpiry, parseBillingProduct } from "@/lib/billing";
import { getStripe } from "@/lib/stripe";
import { stripeCheckoutPlanLabel } from "@/lib/stripe-plan-labels";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { trackAnalyticsEventServer } from "@/lib/track-analytics-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Admin = ReturnType<typeof createServiceSupabaseClient>;

/** Events this endpoint acts on. Configure exactly these on the Stripe webhook endpoint. */
const HANDLED = new Set<string>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
]);

/**
 * Stripe webhook: https://doneunder.ai/api/stripe/webhook (custom domain; preview URLs sit behind Vercel SSO).
 * - Verifies the signature on the raw body.
 * - Idempotent: every event id is logged in public.stripe_events; already processed ids are acknowledged
 *   without side effects, and every handler is itself safe to re-run (unique checkout_session_id,
 *   subscription state re-read from Stripe instead of trusting event order).
 * - Returns 500 on handler failure so Stripe retries.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = req.headers.get("stripe-signature");
  if (!secret || !process.env.STRIPE_SECRET_KEY?.trim()) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const stripe = getStripe();
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true, ignored: true });

  const admin = createServiceSupabaseClient();

  const { error: insertError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, livemode: event.livemode, status: "processing" });
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("[stripe/webhook] event log insert failed", insertError);
      return NextResponse.json({ error: "Storage error." }, { status: 500 });
    }
    const { data: existing } = await admin.from("stripe_events").select("status").eq("id", event.id).maybeSingle();
    if (existing?.status === "processed") return NextResponse.json({ received: true, duplicate: true });
    // processing/failed: re-run (handlers are idempotent).
  }

  try {
    await handleEvent(stripe, admin, event);
    await admin
      .from("stripe_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error: null })
      .eq("id", event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[stripe/webhook] ${event.type} ${event.id} failed`, error);
    await admin
      .from("stripe_events")
      .update({ status: "failed", error: String(error).slice(0, 500) })
      .eq("id", event.id);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }
}

async function handleEvent(stripe: Stripe, admin: Admin, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutSession(stripe, admin, event.data.object as Stripe.Checkout.Session, event);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return syncSubscription(stripe, admin, sub.id);
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (subId) await syncSubscription(stripe, admin, subId);
      return;
    }
    case "charge.refunded":
      return handleRefund(admin, event.data.object as Stripe.Charge);
  }
}

async function handleCheckoutSession(
  stripe: Stripe,
  admin: Admin,
  session: Stripe.Checkout.Session,
  event: Stripe.Event,
) {
  const customerId = idOf(session.customer);
  const companyId = await resolveCompanyId(admin, session.metadata?.company_id ?? session.client_reference_id, customerId);
  if (!companyId) throw new Error(`No company for checkout session ${session.id}`);

  if (customerId) {
    await admin
      .from("companies")
      .update({ stripe_customer_id: customerId })
      .eq("user_id", companyId)
      .is("stripe_customer_id", null);
  }

  if (session.mode === "subscription") {
    const subId = idOf(session.subscription);
    if (subId) await syncSubscription(stripe, admin, subId, companyId);
    await trackAnalyticsEventServer(AnalyticsEvent.StripeCheckoutComplete, { plan: stripeCheckoutPlanLabel("monthly") });
    return;
  }

  if (session.mode === "payment") {
    // Async methods complete later via checkout.session.async_payment_succeeded.
    if (session.payment_status !== "paid") return;
    const product = parseBillingProduct(session.metadata?.product) ?? "one_time";
    if (product !== "one_time") return;

    const { error } = await admin.from("search_entitlements").upsert(
      {
        company_id: companyId,
        checkout_session_id: session.id,
        payment_intent_id: idOf(session.payment_intent),
        amount_total: session.amount_total,
        currency: session.currency,
        purchased_at: new Date(event.created * 1000).toISOString(),
        expires_at: oneTimeExpiry(event.created).toISOString(),
      },
      { onConflict: "checkout_session_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    await trackAnalyticsEventServer(AnalyticsEvent.StripeCheckoutComplete, { plan: stripeCheckoutPlanLabel("one_time") });
  }
}

/** Re-read the subscription from Stripe (event order is not guaranteed) and mirror it onto companies. */
async function syncSubscription(stripe: Stripe, admin: Admin, subscriptionId: string, knownCompanyId?: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = idOf(sub.customer);
  const companyId = await resolveCompanyId(admin, knownCompanyId ?? sub.metadata?.company_id, customerId);
  if (!companyId) throw new Error(`No company for subscription ${sub.id}`);

  const status = companyStatusFromStripe(sub.status);

  const { data: current } = await admin
    .from("companies")
    .select("subscription_status,stripe_subscription_id")
    .eq("user_id", companyId)
    .maybeSingle();

  // A stale/duplicate subscription must not switch off a different, active one.
  if (
    status !== "active" &&
    current?.stripe_subscription_id &&
    current.stripe_subscription_id !== sub.id &&
    (current.subscription_status ?? "").toLowerCase() === "active"
  ) {
    return;
  }

  const periodEnds = (sub.items?.data ?? [])
    .map((item) => (item as { current_period_end?: number }).current_period_end)
    .filter((v): v is number => typeof v === "number");
  const periodEnd = periodEnds.length ? new Date(Math.max(...periodEnds) * 1000).toISOString() : null;

  const update: Record<string, unknown> = {
    subscription_status: status,
    stripe_subscription_id: sub.id,
    stripe_subscription_status: sub.status,
    subscription_current_period_end: periodEnd,
    subscription_cancel_at_period_end: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    billing_updated_at: new Date().toISOString(),
  };
  if (status === "active") update.plan = "unlimited_250";
  if (customerId) update.stripe_customer_id = customerId;

  const { error } = await admin.from("companies").update(update).eq("user_id", companyId);
  if (error) throw error;
}

/** Full refund of a one-time search payment revokes that entitlement. */
async function handleRefund(admin: Admin, charge: Stripe.Charge) {
  const paymentIntent = idOf(charge.payment_intent);
  if (!paymentIntent || !charge.refunded) return; // partial refunds keep access
  const { error } = await admin
    .from("search_entitlements")
    .update({ refunded_at: new Date().toISOString() })
    .eq("payment_intent_id", paymentIntent)
    .is("refunded_at", null);
  if (error) throw error;
}

async function resolveCompanyId(admin: Admin, hinted: string | null | undefined, customerId: string | null) {
  if (hinted && /^[0-9a-f-]{36}$/i.test(hinted)) {
    const { data } = await admin.from("companies").select("user_id").eq("user_id", hinted).maybeSingle();
    if (data) return data.user_id as string;
  }
  if (customerId) {
    const { data } = await admin.from("companies").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    if (data) return data.user_id as string;
  }
  return null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (fromParent) return idOf(fromParent);
  // Older API versions put it on the invoice itself.
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idOf(legacy ?? null);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
