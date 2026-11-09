import Stripe from "stripe";
import { NextResponse } from "next/server";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { COMPANY_BILLING, type CompanyCheckoutAccess } from "@/lib/company-billing";
import { isStripeConfigured } from "@/lib/feature-flags";
import { stripeCheckoutPlanLabel } from "@/lib/stripe-plan-labels";
import { trackAnalyticsEventServer } from "@/lib/track-analytics-server";

const subscriptionPlanMap: Record<string, string | undefined> = {
  "149": process.env.STRIPE_PRICE_149,
  "199": process.env.STRIPE_PRICE_199,
  "249": process.env.STRIPE_PRICE_249,
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      plan?: string;
      access?: CompanyCheckoutAccess;
      customerEmail?: string;
      searchId?: string;
      matchCount?: number;
    };

    const access: CompanyCheckoutAccess =
      body.access === "one_time_search" || body.access === "monthly"
        ? body.access
        : body.plan
          ? "monthly"
          : "one_time_search";

    if (!isStripeConfigured()) {
      return NextResponse.json(
        {
          error: "Billing is temporarily unavailable. Please try again later.",
          demo: true,
        },
        { status: 503 },
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe is not configured.", demo: true }, { status: 500 });
    }
    const stripe = new Stripe(stripeKey);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    if (access === "one_time_search") {
      const oneTimePrice = process.env.STRIPE_PRICE_SEARCH_ONCE;
      if (!oneTimePrice) {
        // TODO(billing): create Stripe one-time price and set STRIPE_PRICE_SEARCH_ONCE.
        return NextResponse.json(
          {
            error: "One-time search price is not configured yet.",
            demo: true,
          },
          { status: 503 },
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: oneTimePrice, quantity: 1 }],
        customer_email: body.customerEmail,
        success_url: `${appUrl}/company/search?billing=success&access=one_time_search`,
        cancel_url: `${appUrl}/company/search?billing=cancelled`,
        metadata: {
          access: "one_time_search",
          search_id: body.searchId ?? "",
          match_count: String(body.matchCount ?? ""),
          product: COMPANY_BILLING.oneTime.key,
        },
      });

      await trackAnalyticsEventServer(AnalyticsEvent.StripeCheckoutStart, {
        plan: "one_time_search",
        access: "one_time_search",
      });

      return NextResponse.json({ url: session.url });
    }

    const plan = body.plan ?? COMPANY_BILLING.monthly.planKey;
    const price = subscriptionPlanMap[plan];
    if (!price) return NextResponse.json({ error: "Invalid plan selected." }, { status: 400 });

    const planLabel = stripeCheckoutPlanLabel(plan);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: body.customerEmail,
      success_url: `${appUrl}/company/search?billing=success&access=monthly&plan=${encodeURIComponent(planLabel)}`,
      cancel_url: `${appUrl}/company/search?billing=cancelled`,
      metadata: {
        access: "monthly",
        plan: planLabel,
      },
    });

    await trackAnalyticsEventServer(AnalyticsEvent.StripeCheckoutStart, {
      plan: planLabel,
      access: "monthly",
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to create checkout session", detail: String(error) },
      { status: 400 },
    );
  }
}
