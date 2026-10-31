import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appBaseUrl,
  checkoutModeFor,
  companyStatusFromStripe,
  oneTimeExpiry,
  parseBillingProduct,
  parseBillingStatus,
  priceIdFor,
} from "../lib/billing";
import {
  companyRegisterPath,
  normalizeCompanyName,
  productFromSearchParam,
} from "../lib/company-register";

describe("billing", () => {
  it("parses products and aliases", () => {
    assert.equal(parseBillingProduct("one_time"), "one_time");
    assert.equal(parseBillingProduct("single_search"), "one_time");
    assert.equal(parseBillingProduct(" Monthly "), "monthly");
    assert.equal(parseBillingProduct("unlimited_monthly"), "monthly");
    assert.equal(parseBillingProduct("199"), null);
    assert.equal(parseBillingProduct(undefined), null);
  });

  it("maps products to Checkout modes", () => {
    assert.equal(checkoutModeFor("one_time"), "payment");
    assert.equal(checkoutModeFor("monthly"), "subscription");
  });

  it("reads price ids from env", () => {
    const env = { STRIPE_PRICE_ONE_TIME: " price_a ", STRIPE_PRICE_MONTHLY: "" } as unknown as NodeJS.ProcessEnv;
    assert.equal(priceIdFor("one_time", env), "price_a");
    assert.equal(priceIdFor("monthly", env), null);
  });

  it("expires one-time searches 30 days after payment", () => {
    const paid = Date.UTC(2026, 9, 30, 8, 0, 0) / 1000;
    assert.equal(oneTimeExpiry(paid).toISOString(), "2026-11-29T08:00:00.000Z");
  });

  it("maps Stripe subscription statuses to the access gate", () => {
    assert.equal(companyStatusFromStripe("active"), "active");
    assert.equal(companyStatusFromStripe("trialing"), "active");
    assert.equal(companyStatusFromStripe("past_due"), "past_due");
    for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", undefined]) {
      assert.equal(companyStatusFromStripe(s), "inactive");
    }
  });

  it("builds the app base url without trailing slash", () => {
    assert.equal(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://doneunder.ai/" } as unknown as NodeJS.ProcessEnv), "https://doneunder.ai");
    assert.equal(appBaseUrl({} as NodeJS.ProcessEnv), "https://doneunder.ai");
  });

  it("parses the billing status RPC defensively", () => {
    assert.equal(parseBillingStatus(null), null);
    const s = parseBillingStatus({ subscription_active: true, open_one_time_searches: 2, has_stripe_customer: true });
    assert.ok(s);
    assert.equal(s.subscription_active, true);
    assert.equal(s.open_one_time_searches, 2);
    assert.equal(s.current_period_end, null);
  });

  it("builds company register paths from the chosen product", () => {
    assert.equal(productFromSearchParam("one_time"), "one_time");
    assert.equal(productFromSearchParam("monthly"), "monthly");
    assert.equal(productFromSearchParam("nope"), null);
    assert.equal(companyRegisterPath("one_time"), "/register/company?product=one_time");
    assert.equal(companyRegisterPath(null), "/register/company");
    assert.equal(normalizeCompanyName("  Acme   Diving  "), "Acme Diving");
  });
});
