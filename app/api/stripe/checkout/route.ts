import Stripe from "stripe";
import { NextResponse } from "next/server";

const planMap: Record<string, string | undefined> = {
  "149": process.env.STRIPE_PRICE_149,
  "199": process.env.STRIPE_PRICE_199,
  "249": process.env.STRIPE_PRICE_249,
};

export async function POST(req: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
    }
    const stripe = new Stripe(stripeKey);
    const { plan = "199", customerEmail } = await req.json();
    const price = planMap[plan];
    if (!price) return NextResponse.json({ error: "Invalid plan selected." }, { status: 400 });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/company?billing=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?billing=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to create checkout session", detail: String(error) },
      { status: 400 },
    );
  }
}
