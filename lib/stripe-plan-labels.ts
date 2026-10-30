import type { BillingProduct } from "@/lib/billing";

/** Public plan keys used in analytics and redirects — not Stripe price ids. */
export const STRIPE_CHECKOUT_PLAN_LABELS: Record<BillingProduct, string> = {
  one_time: "company_one_time_190",
  monthly: "company_unlimited_250",
};

export function stripeCheckoutPlanLabel(planKey: string) {
  return STRIPE_CHECKOUT_PLAN_LABELS[planKey as BillingProduct] ?? "company_unknown";
}
