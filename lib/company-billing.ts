/**
 * Company Search & Match billing — product decisions (2026-11-09).
 *
 * One-time purchase unlocks **that one search only** (all matches in the
 * current result set). It does **not** add a credit bank for later searches.
 * A new search needs another one-time unlock or an active monthly plan.
 *
 * Monthly subscription keeps Search & Match open (rate-limited) and unlocks
 * each search's full profiles while the subscription is active.
 */

export const COMPANY_BILLING = {
  oneTime: {
    key: "one_time_search" as const,
    label: "Unlock this search",
    shortLabel: "One-time",
    /** Display price until Stripe price ids are configured per market. */
    displayPrice: "€149",
    summary: "Unlock full profiles for every match in this search only.",
    detail:
      "Pays for the current search result set (up to 10 candidates). Run a new search later and you unlock that one separately — or switch to monthly.",
  },
  monthly: {
    key: "monthly" as const,
    /** Maps to existing Stripe company plan key used in checkout. */
    planKey: "199",
    label: "Monthly access",
    shortLabel: "Monthly",
    displayPrice: "€199/mo",
    summary: "Search and unlock full profiles while your subscription is active.",
    detail:
      "Ongoing Search & Match for your hiring desk. Rate limits still apply (20 searches/hour). Cancel anytime via billing support.",
  },
} as const;

export type CompanyCheckoutAccess = "one_time_search" | "monthly";

export function companyCheckoutAccessLabel(access: CompanyCheckoutAccess) {
  return access === "one_time_search" ? COMPANY_BILLING.oneTime.label : COMPANY_BILLING.monthly.label;
}
