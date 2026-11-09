import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_BILLING } from "../lib/company-billing";
import {
  COMPANY_LANDING_DEFAULT_VARIANT,
  COMPANY_LANDING_VARIANTS,
  resolveCompanyLandingVariant,
} from "../lib/company-landing-copy";
import {
  industryFromSignals,
  initialsFromName,
  previewMatchesFromMock,
} from "../lib/company-preview";
import { criteriaFromForm, friendlyRpcError, MAX_TEASERS, parseSearchRows } from "../lib/company-search";

const teaser = {
  initials: "ES",
  industry: "Offshore wind",
  certs_valid: 3,
  dive_hours_band: "1000-2000",
  sat_hours_band: "not declared",
  available: true,
  verified: false,
  medical_valid: true,
  welding: false,
};

describe("company search", () => {
  it("parses form criteria", () => {
    const form = new FormData();
    form.set("certs", "HSE SCUBA, IMCA Sat\nCSWIP 3.1U");
    form.set("min_dive_hours", "500");
    form.set("available_only", "on");
    const parsed = criteriaFromForm(form);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data.certs, ["HSE SCUBA", "IMCA Sat", "CSWIP 3.1U"]);
    assert.equal(parsed.data.min_dive_hours, 500);
    assert.equal(parsed.data.available_only, true);
    assert.equal(parsed.data.verified_only, false);
  });

  it("rejects more than 10 certs", () => {
    const form = new FormData();
    form.set("certs", Array.from({ length: 11 }, (_, i) => `c${i}`).join(","));
    assert.equal(criteriaFromForm(form).success, false);
  });

  it("caps teasers at 10 and drops rows with unexpected shape", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ search_id: "s1", slot: i + 1, teaser }));
    rows[2] = { search_id: "s1", slot: 3, teaser: { full_name: "Leak" } as never };
    const parsed = parseSearchRows(rows);
    assert.equal(parsed.searchId, "s1");
    assert.equal(parsed.matchCount, MAX_TEASERS - 1);
    assert.equal(parsed.teasers.length, MAX_TEASERS - 1);
    for (const row of parsed.teasers) {
      assert.deepEqual(Object.keys(row.teaser).sort(), Object.keys(teaser).sort());
      assert.equal(typeof row.teaser.initials, "string");
      assert.equal(typeof row.teaser.industry, "string");
    }
  });

  it("strips unknown keys from teasers (no PII passthrough)", () => {
    const parsed = parseSearchRows([{ search_id: "s", slot: 1, teaser: { ...teaser, email: "x@y.z" } }]);
    assert.equal("email" in parsed.teasers[0].teaser, false);
  });

  it("fills initials/industry defaults for legacy RPC teasers", () => {
    const legacy = {
      certs_valid: 1,
      dive_hours_band: "<250",
      sat_hours_band: "not declared",
      available: true,
      verified: true,
      medical_valid: false,
      welding: false,
    };
    const parsed = parseSearchRows([{ search_id: "legacy", slot: 1, teaser: legacy }]);
    assert.equal(parsed.teasers[0].teaser.initials, "??");
    assert.equal(parsed.teasers[0].teaser.industry, "Commercial diving");
  });

  it("maps RPC errors", () => {
    assert.match(friendlyRpcError("rate_limited"), /20 per hour/);
    assert.match(friendlyRpcError("already_revealed"), /new search/);
    assert.match(friendlyRpcError("company_subscription_required"), /unlock/);
    assert.match(friendlyRpcError("weird"), /went wrong/);
  });
});

describe("company preview helpers", () => {
  it("builds initials without exposing the full name", () => {
    assert.equal(initialsFromName("Elin Strand"), "ES");
    assert.equal(initialsFromName("Omar"), "OM");
  });

  it("classifies industry from specialties and headlines", () => {
    assert.equal(industryFromSignals({ specialties: ["NDT", "Wind Farm"] }), "NDT");
    assert.match(industryFromSignals({ headline: "Offshore wind monopile inspector" }), /wind/i);
  });

  it("returns a pre-payment match count with locked teasers", () => {
    const preview = previewMatchesFromMock({
      certs: [],
      welding: [],
      available_only: true,
      verified_only: false,
    });
    assert.ok(preview.matchCount > 0);
    assert.equal(preview.teasers.length, preview.matchCount);
    for (const row of preview.teasers) {
      assert.ok(row.teaser.initials.length >= 1);
      assert.ok(row.teaser.industry.length >= 1);
      assert.equal("full_name" in row.teaser, false);
    }
  });
});

describe("company billing product decision", () => {
  it("documents one-time = this search only (not a credit bank)", () => {
    assert.match(COMPANY_BILLING.oneTime.detail, /current search/i);
    assert.match(COMPANY_BILLING.oneTime.detail, /separately|new search/i);
    assert.equal(COMPANY_BILLING.oneTime.key, "one_time_search");
    assert.equal(COMPANY_BILLING.monthly.key, "monthly");
  });
});

describe("company landing A/B copy", () => {
  it("defaults to Swedish A variant without exclamation marks", () => {
    assert.equal(COMPANY_LANDING_DEFAULT_VARIANT, "a");
    assert.equal(COMPANY_LANDING_VARIANTS.a.headline, "vi har redan börjat leta");
    assert.equal(COMPANY_LANDING_VARIANTS.a.support, "registrera dig och se dina träffar");
    assert.equal(COMPANY_LANDING_VARIANTS.a.headline.includes("!"), false);
    assert.equal(COMPANY_LANDING_VARIANTS.b.headline.includes("!"), false);
  });

  it("resolves ?v=b for the alternate calm headline", () => {
    assert.equal(resolveCompanyLandingVariant("b"), "b");
    assert.equal(resolveCompanyLandingVariant(undefined), "a");
  });
});

describe("Hermes company brief parsing", () => {
  it("extracts tickets and location from a pasted hiring brief", async () => {
    const { heuristicCriteriaFromBrief } = await import("../lib/hermes-company-search");
    const { criteria, summary } = heuristicCriteriaFromBrief(
      "Need IMCA sat divers with NDT in North Sea, 1500 sat hours, available now",
    );
    assert.ok(criteria.certs.some((c) => /IMCA|Sat|NDT|PCN/i.test(c)));
    assert.match(criteria.location ?? "", /North Sea/i);
    assert.equal(criteria.min_sat_hours, 1500);
    assert.equal(criteria.available_only, true);
    assert.match(summary, /Hermes/i);
  });

  it("returns locked preview matches for a Hermes search", async () => {
    const { hermesCompanyPreviewSearch } = await import("../lib/hermes-company-search");
    const outcome = await hermesCompanyPreviewSearch("IMCA welding divers near Aberdeen");
    assert.equal(outcome.result.unlocked, false);
    assert.ok(outcome.result.matchCount >= 0);
    for (const row of outcome.result.teasers) {
      assert.ok(row.teaser.initials);
      assert.ok(row.teaser.industry);
      assert.equal("full_name" in row.teaser, false);
    }
  });
});
