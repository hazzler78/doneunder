import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDiverOwnsStoragePath,
  assertCertificateStagingPath,
  certificateStagingPath,
  mainCvStoragePath,
  validateCertificateUploadMeta,
  validateCvUploadMeta,
} from "../lib/diver-storage-upload";
import { CERT_MAX_BYTES, CV_MAX_BYTES } from "../lib/diver-upload-constants";

describe("diver storage upload validation", () => {
  it("accepts PDF certificates with empty MIME when name ends with .pdf", () => {
    const result = validateCertificateUploadMeta({
      name: "imca-log.pdf",
      size: 8_000_000,
      contentType: "",
    });
    assert.equal(result.ok, true);
  });

  it("rejects oversize certificates", () => {
    const result = validateCertificateUploadMeta({
      name: "big.pdf",
      size: CERT_MAX_BYTES + 1,
      contentType: "application/pdf",
    });
    assert.equal(result.ok, false);
  });

  it("validates CV size up to 12MB", () => {
    assert.equal(
      validateCvUploadMeta({ name: "cv.pdf", size: CV_MAX_BYTES, contentType: "" }).ok,
      true,
    );
    assert.equal(
      validateCvUploadMeta({ name: "cv.pdf", size: CV_MAX_BYTES + 1, contentType: "" }).ok,
      false,
    );
  });

  it("scopes storage paths to the diver folder", () => {
    const diverId = "abc-123";
    const staging = certificateStagingPath(diverId, "upload-id", "ticket.pdf");
    assert.ok(staging.startsWith(`${diverId}/certs/_upload/`));
    assert.equal(assertCertificateStagingPath(diverId, staging), staging);
    assert.throws(() => assertDiverOwnsStoragePath(diverId, "other-user/certs/x.pdf"));
    assert.equal(mainCvStoragePath(diverId), `${diverId}/source/original-cv.pdf`);
  });
});
