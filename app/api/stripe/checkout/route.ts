import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { appBaseUrl, checkoutModeFor, parseBillingProduct, priceIdFor, type BillingProduct } from "@/lib/billing";
import { getSignedInBillingCompany } from "@/lib/billing-company";
import { isStripeConfigured } from "@/lib/feature-flags";
import { getStripe } from "@/lib/stripe";
import { stripeCheckoutPlanLabel } from "@/lib/stripe-plan-labels";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { trackAnalyticsEventServer } from "@/lib/track-analytics-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/checkout
 * Body (form or JSON): { product: "one_time" | "monthly" }
 * - one_time → Checkout mode=payment (USD 190, one search valid 30 days)
 * - monthly  → Checkout mode=subscription (USD 250/month, unlimited with fair use)
 * Form posts get a 303 redirect (to Stripe, login or back to /pricing); JSON callers get { url } / { error }.
 */
export async function POST(req: Request) {
  const wantsJson = (req.headers.get("content-type") ?? "").includes("application/json");
  const base = appBaseUrl();

  const fail = (status: number, code: string, message: string, redirectTo?: string) => {
    if (wantsJson) return NextResponse.json({ error: message, code }, { status });
    return NextResponse.redirect(redirectTo ?? `${base}/pricing?billing=error&reason=${code}`, 303);
  };

  if (!isStripeConfigured()) {
    return fail(503, "unavailable", "Billing is temporarily unavailable. Please try again later.");
  }

  let product: BillingProduct | null = null;
  try {
    if (wantsJson) {
      const body = (await req.json()) as { product?: unknown };
      product = parseBillingProduct(body?.product);
    } else {
      const form = await req.formData();
      product = parseBillingProduct(form.get("product"));
    }
  } catch {
    product = null;
  }
  if (!product) return fail(400, "invalid_product", "Choose a valid plan.");

  const price = priceIdFor(product);
  if (!price) return fail(503, "unavailable", "Billing is temporarily unavailable. Please try again later.");

  const auth = await getSignedInBillingCompany();
  if (!auth.ok) {
    if (auth.reason === "not_authenticated") {
      return fail(401, "not_authenticated", "Sign in with your company account first.",
        `${base}/login?next=${encodeURIComponent("/pricing")}`);
    }
    return fail(403, auth.reason, "A company account is required to buy Search & Match.");
  }
  const company = auth.company;

  if (product === "monthly" && company.subscriptionStatus === "active") {
    return fail(409, "already_subscribed", "You already have Unlimited. Manage it from Billing.");
  }

  try {
    const stripe = getStripe();
    const customerId = await ensureStripeCustomer(stripe, company);

    const mode = checkoutModeFor(product);
    const metadata = { company_id: company.userId, product };

    const params: Stripe.Checkout.SessionCreateParams = {
      mode,
      customer: customerId,
      client_reference_id: company.userId,
      line_items: [{ price, quantity: 1 }],
      metadata,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      customer_update: { name: "auto", address: "auto" },
      allow_promotion_codes: false,
      success_url: `${base}/company/search?billing=success&product=${product}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pricing?billing=cancelled`,
    };
    if (mode === "payment") {
      params.payment_intent_data = { metadata };
      params.invoice_creation = { enabled: true, invoice_data: { metadata } };
    } else {
      params.subscription_data = { metadata };
    }

    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) throw new Error("Stripe returned no checkout URL");

    await trackAnalyticsEventServer(AnalyticsEvent.StripeCheckoutStart, { plan: stripeCheckoutPlanLabel(product) });

    if (wantsJson) return NextResponse.json({ url: session.url });
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("[stripe/checkout] failed", error);
    return fail(502, "checkout_failed", "Unable to start checkout. Please try again.");
  }
}

/** Reuse companies.stripe_customer_id or create one (idempotent per company) and store it. */
async function ensureStripeCustomer(
  stripe: Stripe,
  company: { userId: string; email: string | null; companyName: string; stripeCustomerId: string | null },
): Promise<string> {
  if (company.stripeCustomerId) return company.stripeCustomerId;

  const customer = await stripe.customers.create(
    {
      email: company.email ?? undefined,
      name: company.companyName,
      metadata: { company_id: company.userId },
    },
    { idempotencyKey: `doneunder-customer-${company.userId}` },
  );

  const admin = createServiceSupabaseClient();
  const { data, error } = await admin
    .from("companies")
    .update({ stripe_customer_id: customer.id, billing_updated_at: new Date().toISOString() })
    .eq("user_id", company.userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id")
    .maybeSingle();
  if (error) throw error;
  if (data?.stripe_customer_id) return data.stripe_customer_id as string;

  // Another request stored a customer first: use that one.
  const { data: existing } = await admin
    .from("companies")
    .select("stripe_customer_id")
    .eq("user_id", company.userId)
    .maybeSingle();
  return (existing?.stripe_customer_id as string | null) ?? customer.id;
}
