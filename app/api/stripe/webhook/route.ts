import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const signature = (await headers()).get("stripe-signature");
  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET || !stripeKey) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }
  const stripe = new Stripe(stripeKey);

  const payload = await req.text();

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === "customer.subscription.updated") {
      // Future: sync subscription status in `companies` table.
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: `Webhook error: ${String(error)}` }, { status: 400 });
  }
}
