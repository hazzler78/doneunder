import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  DOCX_MIME,
  detectKindFromBytes,
  mainCvStorageBasename,
  validateDocumentBytes,
} from "../lib/document-bytes";
import { validateCvUploadMeta } from "../lib/diver-storage-upload";
import { looksLikeMainCvFilename, pickMainCvFile } from "../lib/document-names";
import { extractTextFromWordBytes } from "../lib/word-text";

const here = dirname(fileURLToPath(import.meta.url));
const mammothFixture = join(
  here,
  "../node_modules/mammoth/test/test-data/single-paragraph.docx",
);

function includesWordDocumentXml(bytes: Buffer) {
  return bytes.includes(Buffer.from("word/document.xml"));
}

describe("word document bytes", () => {
  it("detects docx zip magic and rejects fake zip", () => {
    const docx = readFileSync(mammothFixture);
    assert.equal(detectKindFromBytes(docx), "docx");
    const fakeZip = Buffer.from("PK\x03\x04not-a-docx");
    assert.equal(detectKindFromBytes(fakeZip), null);
    assert.equal(detectKindFromBytes(fakeZip, { sniffDocxFromZipHead: true }), null);
  });

  it("detects docx from a 512-byte browser head read (PR #54 client validation regression)", () => {
    const docx = readFileSync(mammothFixture);
    const head = docx.subarray(0, 512);
    assert.equal(includesWordDocumentXml(head), false);
    assert.equal(detectKindFromBytes(head), null);
    assert.equal(detectKindFromBytes(head, { sniffDocxFromZipHead: true }), "docx");
  });

  it("keeps full-file validation strict when word/document.xml is missing", () => {
    const zipHeadOnly = Buffer.from("PK\x03\x04[Content_Types].xml");
    assert.equal(detectKindFromBytes(zipHeadOnly, { sniffDocxFromZipHead: true }), "docx");
    const validated = validateDocumentBytes(zipHeadOnly, "cv.docx", DOCX_MIME, "cv");
    assert.equal(validated.ok, false);
  });

  it("validates docx bytes for CV upload meta", () => {
    assert.equal(
      validateCvUploadMeta({
        name: "resume.docx",
        size: 50_000,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }).ok,
      true,
    );
    assert.equal(validateCvUploadMeta({ name: "virus.exe", size: 100, contentType: "" }).ok, false);
    assert.equal(validateCvUploadMeta({ name: "cv.pages", size: 100, contentType: "" }).ok, false);
  });

  it("checks extension against magic bytes", () => {
    const docx = readFileSync(mammothFixture);
    const ok = validateDocumentBytes(docx, "cv.docx", "", "cv");
    assert.equal(ok.ok, true);
    const bad = validateDocumentBytes(docx, "cv.pdf", "", "cv");
    assert.equal(bad.ok, false);
  });

  it("uses original extension in CV storage basename", () => {
    assert.equal(mainCvStorageBasename("My CV.docx"), "original-cv.docx");
    assert.equal(mainCvStorageBasename("cv.pdf"), "original-cv.pdf");
  });

  it("extracts text from a small docx fixture", async () => {
    const docx = readFileSync(mammothFixture);
    const result = await extractTextFromWordBytes(docx, "single-paragraph.docx");
    assert.match(result.text.toLowerCase(), /walking on imported air/);
  });

  it("treats clearly named Word CVs like PDFs in pickMainCvFile", () => {
    assert.equal(looksLikeMainCvFilename("my_resume.docx"), true);
    const files = [{ name: "Certs for dmt.pdf" }, { name: "CV_Alex_Holm.docx" }];
    assert.equal(pickMainCvFile(files)?.name, "CV_Alex_Holm.docx");
  });
});
