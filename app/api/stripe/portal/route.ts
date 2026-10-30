import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/billing";
import { getSignedInBillingCompany } from "@/lib/billing-company";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/portal → Stripe Customer Portal (update card, invoices, cancel Unlimited).
 * Form posts get a 303 redirect; JSON callers get { url }.
 */
export async function POST(req: Request) {
  const wantsJson = (req.headers.get("content-type") ?? "").includes("application/json");
  const base = appBaseUrl();
  const fail = (status: number, code: string, message: string, redirectTo?: string) =>
    wantsJson
      ? NextResponse.json({ error: message, code }, { status })
      : NextResponse.redirect(redirectTo ?? `${base}/company/search?billing=portal_error&reason=${code}`, 303);

  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    return fail(503, "unavailable", "Billing is temporarily unavailable.");
  }

  const auth = await getSignedInBillingCompany();
  if (!auth.ok) {
    if (auth.reason === "not_authenticated") {
      return fail(401, "not_authenticated", "Sign in first.",
        `${base}/login?next=${encodeURIComponent("/company/search")}`);
    }
    return fail(403, auth.reason, "A company account is required.");
  }
  if (!auth.company.stripeCustomerId) {
    return fail(404, "no_customer", "No billing account yet. Buy a plan first.", `${base}/pricing`);
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: auth.company.stripeCustomerId,
      return_url: `${base}/company/search`,
    });
    return wantsJson ? NextResponse.json({ url: session.url }) : NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("[stripe/portal] failed", error);
    return fail(502, "portal_failed", "Unable to open billing. Please try again.");
  }
}
