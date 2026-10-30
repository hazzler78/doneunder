/**
 * Pure billing helpers (no Stripe SDK, no server-only) so they can be unit tested.
 * Pricing decided 2026-10: USD 190 one-time search (valid 30 days), USD 250/month unlimited.
 */

export const BILLING_PRODUCTS = ["one_time", "monthly"] as const;
export type BillingProduct = (typeof BILLING_PRODUCTS)[number];

/** Display prices (USD, excl. VAT). Stripe Prices are the source of truth for the amount charged. */
export const BILLING_PRICES_USD: Record<BillingProduct, number> = {
  one_time: 190,
  monthly: 250,
};

/** A one-time search must be used within this many days of payment. */
export const ONE_TIME_VALIDITY_DAYS = 30;

/** Fair use on Unlimited (enforced in search_divers, migration 018/022). */
export const FAIR_USE = { perHour: 20, perDay: 100 } as const;

export function parseBillingProduct(value: unknown): BillingProduct | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "one_time" || v === "single_search" || v === "one-time") return "one_time";
  if (v === "monthly" || v === "unlimited_monthly" || v === "unlimited") return "monthly";
  return null;
}

export function checkoutModeFor(product: BillingProduct): "payment" | "subscription" {
  return product === "one_time" ? "payment" : "subscription";
}

/** Stripe price id env var per product. */
export function priceIdFor(product: BillingProduct, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = product === "one_time" ? env.STRIPE_PRICE_ONE_TIME : env.STRIPE_PRICE_MONTHLY;
  const id = raw?.trim();
  return id ? id : null;
}

/** Entitlement expiry: payment time + 30 days. `paidAtUnix` is Stripe's `created` (seconds). */
export function oneTimeExpiry(paidAtUnix: number, days = ONE_TIME_VALIDITY_DAYS): Date {
  return new Date((paidAtUnix + days * 24 * 60 * 60) * 1000);
}

/**
 * Map a Stripe subscription status onto companies.subscription_status (the access gate).
 * Only 'active' grants access. past_due is kept as its own value so the UI can prompt a card update.
 */
export function companyStatusFromStripe(status: string | null | undefined): "active" | "past_due" | "inactive" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    default:
      // incomplete, incomplete_expired, unpaid, canceled, paused, unknown
      return "inactive";
  }
}

/** App base URL for Stripe redirects. Never trust the request Host header for this. */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = (env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || "https://doneunder.ai").trim();
  return url.replace(/\/$/, "");
}

export type CompanyBillingStatus = {
  subscription_active: boolean;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_stripe_customer: boolean;
  open_one_time_searches: number;
  next_one_time_expiry: string | null;
};

export function parseBillingStatus(data: unknown): CompanyBillingStatus | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    subscription_active: d.subscription_active === true,
    subscription_status: typeof d.subscription_status === "string" ? d.subscription_status : null,
    current_period_end: typeof d.current_period_end === "string" ? d.current_period_end : null,
    cancel_at_period_end: d.cancel_at_period_end === true,
    has_stripe_customer: d.has_stripe_customer === true,
    open_one_time_searches: typeof d.open_one_time_searches === "number" ? d.open_one_time_searches : 0,
    next_one_time_expiry: typeof d.next_one_time_expiry === "string" ? d.next_one_time_expiry : null,
  };
}
