import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveProfessionalHeadline, profileHasEnoughDataForDerivedHeadline } from "../lib/headline-derive";

describe("deriveProfessionalHeadline", () => {
  it("builds a headline from ticket names and role without inventing tickets", () => {
    const headline = deriveProfessionalHeadline({
      diverFullName: "Antonio Garcia",
      certifications: [
        { name: "Antonio Garcia", issuing_body: "HSE" },
        { name: "Diver Medic Technician (DMT)", issuing_body: "IMCA" },
        { name: "CSWIP 3.2U", issuing_body: "TWI" },
        { name: "HSE Closed Bell Saturation Diver", issuing_body: "HSE" },
      ],
      experiences: [{ role_title: "Saturation Diver", company: "Subsea 7" }],
      polishedCvMarkdown: "",
    });
    assert.match(headline ?? "", /Diver Medic Technician/i);
    assert.match(headline ?? "", /CSWIP 3\.2U/);
    assert.doesNotMatch(headline ?? "", /Antonio/i);
  });

  it("returns null when there is no usable profile data", () => {
    assert.equal(
      profileHasEnoughDataForDerivedHeadline({
        certifications: [],
        experiences: [],
        polishedCvMarkdown: "short",
      }),
      false,
    );
    assert.equal(
      deriveProfessionalHeadline({
        certifications: [],
        experiences: [],
        polishedCvMarkdown: "short",
      }),
      null,
    );
  });
});
