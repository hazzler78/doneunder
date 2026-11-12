import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  classifyDocumentFile,
  detectKindFromBytes,
  unsupportedDocumentMessage,
} from "../lib/document-bytes";
import { isAcceptedMainCvFile } from "../lib/cv-upload";

const here = dirname(fileURLToPath(import.meta.url));
const mammothFixture = join(
  here,
  "../node_modules/mammoth/test/test-data/single-paragraph.docx",
);

const CLIENT_HEAD_BYTES = 512;

/** Mirrors lib/browser-file-validation.ts validateCvFileOnClient (without File API). */
function validateCvUploadHead(fileName: string, contentType: string, head: Uint8Array): string | null {
  if (!isAcceptedMainCvFile({ name: fileName, type: contentType })) {
    return unsupportedDocumentMessage(fileName, "cv");
  }
  const detected = detectKindFromBytes(head, { sniffDocxFromZipHead: true });
  const declared = classifyDocumentFile(fileName, contentType);
  if (!detected || (declared && declared !== detected)) {
    return unsupportedDocumentMessage(fileName, "cv");
  }
  return null;
}

describe("browser CV file validation", () => {
  it("accepts .docx CV when only the first 512 bytes are available", () => {
    const docx = readFileSync(mammothFixture);
    const head = docx.subarray(0, CLIENT_HEAD_BYTES);
    const err = validateCvUploadHead(
      "Zandre_Marcus_CV.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      head,
    );
    assert.equal(err, null);
  });
});
