import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appBaseUrl } from "@/lib/billing";
import { getSignedInBillingCompany } from "@/lib/billing-company";
import { companyRegisterPath, productFromSearchParam } from "@/lib/company-register";
import { SITE_URL } from "@/lib/site";
import { createCompanyCheckoutUrl } from "@/lib/stripe-checkout";

export const metadata: Metadata = {
  title: "Continue to checkout | doneunder.ai",
  robots: { index: false, follow: false },
};

/**
 * Signed-in company → Stripe Checkout for the selected product.
 * Used when /register/company detects an existing company session.
 */
export default async function CompanyCheckoutContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: productRaw } = await searchParams;
  const product = productFromSearchParam(productRaw);
  if (!product) redirect("/pricing");

  const auth = await getSignedInBillingCompany();
  if (!auth.ok) {
    redirect(companyRegisterPath(product));
  }

  if (product === "monthly" && auth.company.subscriptionStatus === "active") {
    redirect("/company/search");
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : appBaseUrl() || SITE_URL;

  try {
    const url = await createCompanyCheckoutUrl(auth.company, product, { baseUrl: origin });
    redirect(url);
  } catch (error) {
    console.error("[company/continue] checkout failed", error);
    redirect("/pricing?billing=error&reason=checkout_failed");
  }
}
