import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikeCertificateFilename,
  looksLikeMainCvFilename,
  pickMainCvFile,
  pickMainCvForCertificatePanelUpload,
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

  it("recognizes CamelCase CV filenames (SF-2)", () => {
    assert.equal(looksLikeMainCvFilename("MNaidooDiveCV.pdf"), true);
    assert.equal(looksLikeCertificateFilename("MNaidooDiveCV.pdf"), false);
    assert.equal(pickMainCvFile([{ name: "MNaidooDiveCV.pdf" }])?.name, "MNaidooDiveCV.pdf");
  });

  it("treats CamelCase cert filenames as certificates, not the main CV", () => {
    assert.equal(looksLikeCertificateFilename("MNaidooDiveCerts.pdf"), true);
    assert.equal(looksLikeMainCvFilename("MNaidooDiveCerts.pdf"), false);
    assert.equal(pickMainCvFile([{ name: "MNaidooDiveCerts.pdf" }]), null);
  });

  it("recognizes CamelCase Resume Word documents as CVs", () => {
    assert.equal(looksLikeMainCvFilename("JohnSmithResume.docx"), true);
    assert.equal(pickMainCvFile([{ name: "JohnSmithResume.docx" }])?.name, "JohnSmithResume.docx");
  });

  it("routes certificate-panel CV filenames only when no CV is stored", () => {
    const batch = [{ name: "Cv Diver Percio Salles.pdf" }, { name: "BOSIET.pdf" }];
    assert.equal(
      pickMainCvForCertificatePanelUpload(batch, { hasStoredCv: false })?.name,
      "Cv Diver Percio Salles.pdf",
    );
    assert.equal(pickMainCvForCertificatePanelUpload(batch, { hasStoredCv: true }), null);
  });
});
