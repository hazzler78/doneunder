import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
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

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
      const status =
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : subscription.status === "active" || subscription.status === "trialing"
            ? "active"
            : subscription.status === "past_due"
              ? "past_due"
              : "inactive";

      if (customerId && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        await admin
          .from("companies")
          .update({ subscription_status: status, stripe_customer_id: customerId })
          .eq("stripe_customer_id", customerId);
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const access = session.metadata?.access;
      const email = session.customer_details?.email || session.customer_email;
      // One-time search unlock is session-scoped in the app today (success URL).
      // TODO(billing): persist search_id unlock rows when preview_search RPCs land in prod.
      if (
        access === "monthly" &&
        email &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const customerId = typeof session.customer === "string" ? session.customer : null;
        const { data: user } = await admin.from("users").select("id").eq("email", email).maybeSingle();
        if (user?.id) {
          await admin
            .from("companies")
            .update({
              subscription_status: "active",
              ...(customerId ? { stripe_customer_id: customerId } : {}),
            })
            .eq("user_id", user.id);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: `Webhook error: ${String(error)}` }, { status: 400 });
  }
}
