import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAcceptedMainCvFile, isWordCvFile } from "../lib/cv-upload";

describe("cv upload validation", () => {
  it("detects Word CV files", () => {
    assert.equal(isWordCvFile({ name: "resume.docx", type: "" }), true);
    assert.equal(isWordCvFile({ name: "CV.doc", type: "application/msword" }), true);
    assert.equal(isWordCvFile({ name: "cv.pdf", type: "application/pdf" }), false);
  });

  it("accepts PDF CV files only", () => {
    assert.equal(isAcceptedMainCvFile({ name: "cv.pdf", type: "application/pdf" }), true);
    assert.equal(isAcceptedMainCvFile({ name: "cv.docx", type: "" }), false);
  });
});
