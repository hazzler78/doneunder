/** Public plan keys used in checkout — not Stripe price ids. */
export const STRIPE_CHECKOUT_PLAN_LABELS: Record<string, string> = {
  "149": "company_149",
  "199": "company_199",
  "249": "company_249",
};

export function stripeCheckoutPlanLabel(planKey: string) {
  return STRIPE_CHECKOUT_PLAN_LABELS[planKey] ?? "company_unknown";
}
