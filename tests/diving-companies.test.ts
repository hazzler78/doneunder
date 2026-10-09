import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companyApplicationDraft,
  formatCompanyMatchReason,
  scoreDiverAgainstCompany,
} from "../lib/diving-companies";

describe("diving company soft match", () => {
  const company = {
    typical_certs: ["IMCA", "HSE Diver Medical"],
    location: "Scotland",
    country: "UK",
    apply_email: null as string | null,
  };

  it("scores weak when no tickets and cannot apply without email", () => {
    const match = scoreDiverAgainstCompany(company, { certNames: [] });
    assert.equal(match.verdict, "weak");
    assert.equal(match.canApply, false);
    assert.ok(match.missing.includes("IMCA"));
  });

  it("allows apply when email is verified even if tickets are missing", () => {
    const match = scoreDiverAgainstCompany(
      { ...company, apply_email: "careers@contractor.test" },
      { certNames: ["BOSIET"] },
    );
    assert.equal(match.canApply, true);
    assert.ok(match.missing.length > 0);
    assert.match(formatCompanyMatchReason(match), /Apply allowed with warn/);
  });

  it("builds a draft to the verified inbox only", () => {
    const draft = companyApplicationDraft(
      {
        name: "Shearwater Marine Services",
        location: "Scotland",
        apply_email: "careers@contractor.test",
      },
      "Alex Diver",
    );
    assert.equal(draft.to, "careers@contractor.test");
    assert.match(draft.subject, /Alex Diver/);
    assert.match(draft.body, /Shearwater/);
  });
});
