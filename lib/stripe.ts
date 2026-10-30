import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

/** Server-side Stripe client. Uses the API version pinned by the installed SDK. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!client) {
    client = new Stripe(key, {
      appInfo: { name: "doneunder.ai", url: "https://doneunder.ai" },
      maxNetworkRetries: 2,
    });
  }
  return client;
}
