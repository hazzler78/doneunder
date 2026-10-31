import "server-only";

import type Stripe from "stripe";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { appBaseUrl, checkoutModeFor, priceIdFor, type BillingProduct } from "@/lib/billing";
import type { BillingCompany } from "@/lib/billing-company";
import { getStripe } from "@/lib/stripe";
import { stripeCheckoutPlanLabel } from "@/lib/stripe-plan-labels";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { trackAnalyticsEventServer } from "@/lib/track-analytics-server";

/** Create a Stripe Checkout Session for a signed-in company and return the hosted URL. */
export async function createCompanyCheckoutUrl(
  company: BillingCompany,
  product: BillingProduct,
  options?: { baseUrl?: string },
): Promise<string> {
  const price = priceIdFor(product);
  if (!price) throw new Error("Stripe price is not configured for this product.");

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(stripe, company);
  const base = (options?.baseUrl ?? appBaseUrl()).replace(/\/$/, "");
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

  await trackAnalyticsEventServer(AnalyticsEvent.StripeCheckoutStart, {
    plan: stripeCheckoutPlanLabel(product),
  });

  return session.url;
}

/** Reuse companies.stripe_customer_id or create one (idempotent per company) and store it. */
export async function ensureStripeCustomer(
  stripe: Stripe,
  company: {
    userId: string;
    email: string | null;
    companyName: string;
    stripeCustomerId: string | null;
  },
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

  const { data: existing } = await admin
    .from("companies")
    .select("stripe_customer_id")
    .eq("user_id", company.userId)
    .maybeSingle();
  return (existing?.stripe_customer_id as string | null) ?? customer.id;
}
