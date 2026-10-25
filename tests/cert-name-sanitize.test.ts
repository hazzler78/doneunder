import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { certificationNameMatchesDiver, sanitizeParsedCertificationName } from "../lib/cert-text";

describe("sanitizeParsedCertificationName", () => {
  it("replaces a diver name with an inferred ticket title", () => {
    const name = sanitizeParsedCertificationName("Antonio Garcia", "HSE Diver Medical", "Antonio Garcia");
    assert.match(name, /medical/i);
    assert.doesNotMatch(name, /Antonio/i);
  });

  it("matches diver full names on cert rows", () => {
    assert.equal(certificationNameMatchesDiver("Gareth Darrin Middleton", "Gareth Darrin Middleton"), true);
    assert.equal(certificationNameMatchesDiver("IMCA Diver", "Gareth Darrin Middleton"), false);
  });
});
