import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCvPdfLines } from "../lib/cv-pdf";
import { emptyDiverProfileScalars, type DiverProfileFull } from "../lib/diver-profile";

function minimalProfile(phone: string | null = null): DiverProfileFull {
  return {
    profile: { ...emptyDiverProfileScalars(), phone, headline: "Diver", bio: "Summary" },
    experiences: [],
    certifications: [],
    references: [],
  };
}

describe("CV PDF contact block", () => {
  it("includes contact section when sending as the diver", () => {
    const lines = buildCvPdfLines(minimalProfile("+44 7700 900123"), "Alex Holm", {
      email: "alex@example.com",
      phone: "+44 7700 900123",
    });
    const text = lines.map((line) => line.text).join("\n");
    assert.match(text, /Contact/);
    assert.match(text, /alex@example\.com/);
    assert.match(text, /\+44 7700 900123/);
  });

  it("omits contact section without outbound contact (public/teaser exports)", () => {
    const lines = buildCvPdfLines(minimalProfile("+44 7700 900123"), "Alex Holm");
    const text = lines.map((line) => line.text).join("\n");
    assert.equal(text.includes("Contact"), false);
    assert.equal(text.includes("alex@example.com"), false);
  });
});
