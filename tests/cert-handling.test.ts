import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  certificationDocumentSourceRef,
  mergeDefinedCertificationPatch,
  resolveCertificationMatchIndexes,
  storagePathsFromCertificationSourceRef,
} from "../lib/certification-profile-utils";
import type { DiverCertificationInput } from "../lib/diver-profile";

const cert = (overrides: Partial<DiverCertificationInput> & { name: string }): DiverCertificationInput => ({
  name: overrides.name,
  id: overrides.id,
  issue_date: overrides.issue_date,
  expiry_date: overrides.expiry_date,
  cert_number: overrides.cert_number,
  issuing_body: overrides.issuing_body,
  source_ref: overrides.source_ref,
  expiry_confirmed: overrides.expiry_confirmed,
});

describe("mergeDefinedCertificationPatch (inspect_certificates name wipe)", () => {
  it("does not overwrite stored title with undefined or empty patch fields", () => {
    const existing = cert({
      id: "11111111-1111-4111-8111-111111111111",
      name: "IMCA Surface Supplied (Top Up)",
      expiry_date: "2026-05-01",
    });
    const merged = mergeDefinedCertificationPatch(existing, {
      name: undefined,
      cert_number: undefined,
      issuing_body: undefined,
      expiry_date: "2027-01-15",
    });
    assert.equal(merged.name, "IMCA Surface Supplied (Top Up)");
    assert.equal(merged.expiry_date, "2027-01-15");
  });
});

describe("resolveCertificationMatchIndexes", () => {
  it("refuses ambiguous loose name matches that used to hit the wrong row", () => {
    const items = [
      cert({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Certification", expiry_date: "2026-01-01" }),
      cert({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Certification", expiry_date: "2027-01-01" }),
    ];
    const resolved = resolveCertificationMatchIndexes(items, { name: "Certification" });
    assert.equal(resolved.indexes.length, 0);
    assert.match(resolved.error ?? "", /Multiple certifications/i);
  });

  it("matches removal by stable id", () => {
    const items = [
      cert({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "HSE Diver Medical", expiry_date: "2024-01-01" }),
      cert({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "HSE Diver Medical", expiry_date: "2027-01-01" }),
    ];
    const resolved = resolveCertificationMatchIndexes(items, {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    assert.deepEqual(resolved.indexes, [0]);
  });
});

describe("certification storage source refs (removed certs coming back)", () => {
  it("maps file source_ref to a storage path for deletion", () => {
    const path = "diver-1/certs/medical.pdf";
    const ref = certificationDocumentSourceRef(path);
    assert.deepEqual(storagePathsFromCertificationSourceRef(ref), [path]);
  });
});
