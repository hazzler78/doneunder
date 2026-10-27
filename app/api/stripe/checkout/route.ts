import Stripe from "stripe";
import { NextResponse } from "next/server";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { isStripeConfigured } from "@/lib/feature-flags";
import { stripeCheckoutPlanLabel } from "@/lib/stripe-plan-labels";
import { trackAnalyticsEventServer } from "@/lib/track-analytics-server";

const planMap: Record<string, string | undefined> = {
  "149": process.env.STRIPE_PRICE_149,
  "199": process.env.STRIPE_PRICE_199,
  "249": process.env.STRIPE_PRICE_249,
};

export async function POST(req: Request) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Billing is temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
    }
    const stripe = new Stripe(stripeKey);
    const { plan = "199", customerEmail } = await req.json();
    const price = planMap[plan];
    if (!price) return NextResponse.json({ error: "Invalid plan selected." }, { status: 400 });

    const planLabel = stripeCheckoutPlanLabel(plan);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${appUrl}/workspace?billing=success&plan=${encodeURIComponent(planLabel)}`,
      cancel_url: `${appUrl}/pricing?billing=cancelled`,
    });

    await trackAnalyticsEventServer(AnalyticsEvent.StripeCheckoutStart, { plan: planLabel });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to create checkout session", detail: String(error) },
      { status: 400 },
    );
  }
}
