import { parseBillingProduct, type BillingProduct } from "@/lib/billing";

/** Company signup continues into Stripe checkout for this product. */
export function productFromSearchParam(value: string | null | undefined): BillingProduct | null {
  return parseBillingProduct(value);
}

export function companyRegisterPath(product: BillingProduct | null | undefined) {
  if (!product) return "/register/company";
  return `/register/company?product=${encodeURIComponent(product)}`;
}

export function companyCheckoutContinuePath(product: BillingProduct) {
  return `/register/company/continue?product=${encodeURIComponent(product)}`;
}

export function normalizeCompanyName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function normalizeContactName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
}
