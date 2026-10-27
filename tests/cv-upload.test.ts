import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAcceptedMainCvFile, isWordCvFile } from "../lib/cv-upload";
import { validateCvUploadMeta } from "../lib/diver-storage-upload";

describe("cv upload validation", () => {
  it("detects Word CV files", () => {
    assert.equal(isWordCvFile({ name: "resume.docx", type: "" }), true);
    assert.equal(isWordCvFile({ name: "CV.doc", type: "application/msword" }), true);
    assert.equal(isWordCvFile({ name: "cv.pdf", type: "application/pdf" }), false);
  });

  it("accepts PDF and Word CV files", () => {
    assert.equal(isAcceptedMainCvFile({ name: "cv.pdf", type: "application/pdf" }), true);
    assert.equal(isAcceptedMainCvFile({ name: "cv.docx", type: "" }), true);
    assert.equal(isAcceptedMainCvFile({ name: "cv.doc", type: "application/msword" }), true);
    assert.equal(isAcceptedMainCvFile({ name: "cv.pages", type: "" }), false);
  });

  it("rejects unsupported CV extensions in upload meta", () => {
    const result = validateCvUploadMeta({ name: "notes.odt", size: 1000, contentType: "" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Unsupported file type/);
    }
  });
});
