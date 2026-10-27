import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikeCertificateFilename,
  looksLikeMainCvFilename,
  pickMainCvFile,
  pickMainCvFromChatAttachment,
} from "../lib/document-names";

describe("pickMainCvFile conservative classification", () => {
  it("does not treat ambiguous certificate PDFs as the main CV", () => {
    const certNames = ["Certs for dmt.pdf", "basil_DMT.pdf", "CDA-PT1.pdf"];
    for (const name of certNames) {
      assert.equal(looksLikeCertificateFilename(name), true);
      assert.equal(looksLikeMainCvFilename(name), false);
      assert.equal(pickMainCvFile([{ name }]), null);
    }
  });

  it("still picks a clearly named CV from a mixed batch", () => {
    const files = [
      { name: "Certs for dmt.pdf" },
      { name: "CV_Alex_Holm.pdf" },
      { name: "OPITO_BOSIET.pdf" },
    ];
    assert.equal(pickMainCvFile(files)?.name, "CV_Alex_Holm.pdf");
  });

  it("does not replace a stored CV from chat unless the attachment is clearly a CV", () => {
    const files = [{ name: "seamansbook.pdf" }, { name: "basil_DMT.pdf" }];
    assert.equal(pickMainCvFromChatAttachment(files, { hasStoredCv: true })?.name, "seamansbook.pdf");
    assert.equal(pickMainCvFromChatAttachment([{ name: "basil_DMT.pdf" }], { hasStoredCv: true }), null);
  });

  it("allows a first CV upload from chat when the filename names a CV", () => {
    assert.equal(
      pickMainCvFromChatAttachment([{ name: "my_resume.pdf" }], { hasStoredCv: false })?.name,
      "my_resume.pdf",
    );
    assert.equal(
      pickMainCvFromChatAttachment([{ name: "my_resume.docx" }], { hasStoredCv: false })?.name,
      "my_resume.docx",
    );
  });
});
