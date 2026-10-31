import { NextResponse } from "next/server";
import { appBaseUrl, parseBillingProduct, priceIdFor, type BillingProduct } from "@/lib/billing";
import { getSignedInBillingCompany } from "@/lib/billing-company";
import { companyRegisterPath } from "@/lib/company-register";
import { isStripeConfigured } from "@/lib/feature-flags";
import { createCompanyCheckoutUrl } from "@/lib/stripe-checkout";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/checkout
 * Body (form or JSON): { product: "one_time" | "monthly" }
 * - one_time → Checkout mode=payment (USD 190, one search valid 30 days)
 * - monthly  → Checkout mode=subscription (USD 250/month, unlimited with fair use)
 * Form posts get a 303 redirect (to Stripe, company register, or back to /pricing); JSON callers get { url } / { error }.
 */
export async function POST(req: Request) {
  const wantsJson = (req.headers.get("content-type") ?? "").includes("application/json");
  const requestOrigin = new URL(req.url).origin;
  const base =
    requestOrigin.includes("localhost") || requestOrigin.includes("vercel.app")
      ? requestOrigin
      : appBaseUrl();

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
    // No company account yet → self-register, then continue into the chosen plan.
    const registerPath = companyRegisterPath(product);
    if (auth.reason === "not_authenticated" || auth.reason === "not_company" || auth.reason === "no_company_row") {
      return fail(
        auth.reason === "not_authenticated" ? 401 : 403,
        auth.reason,
        "Create a company account to buy Search & Match.",
        `${base}${registerPath}`,
      );
    }
    return fail(403, auth.reason, "A company account is required to buy Search & Match.");
  }
  const company = auth.company;

  if (product === "monthly" && company.subscriptionStatus === "active") {
    return fail(409, "already_subscribed", "You already have Unlimited. Manage it from Billing.");
  }

  try {
    const url = await createCompanyCheckoutUrl(company, product, { baseUrl: base });
    if (wantsJson) return NextResponse.json({ url });
    return NextResponse.redirect(url, 303);
  } catch (error) {
    console.error("[stripe/checkout] failed", error);
    return fail(502, "checkout_failed", "Unable to start checkout. Please try again.");
  }
}
