import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { prepareCertificateFileForUpload } from "../lib/browser-file-validation";
import { resolveMissingExtensionCertificate } from "../lib/certificate-file-type";
import {
  certificateStagingPath,
  validateCertificateBytes,
  validateCertificateUploadMeta,
} from "../lib/diver-storage-upload";

const here = dirname(fileURLToPath(import.meta.url));
const mammothFixture = join(here, "../node_modules/mammoth/test/test-data/single-paragraph.docx");

const INCIDENT_NAME = "Chadwick Joel Gillion certs.";
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

describe("certificate uploads with no extension", () => {
  it("accepts a PDF whose name has no extension and keeps a .pdf name", () => {
    const result = validateCertificateBytes(pdf, {
      name: "Chadwick Joel Gillion certs",
      contentType: "",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.kind, "pdf");
    assert.equal(result.fileName, "Chadwick Joel Gillion certs.pdf");
    assert.equal(result.contentType, "application/pdf");
    assert.match(
      certificateStagingPath("diver", "upload", result.fileName),
      /Chadwick_Joel_Gillion_certs\.pdf$/,
    );
  });

  it("accepts a trailing-dot filename when the bytes are a PDF", () => {
    const result = validateCertificateBytes(pdf, {
      name: INCIDENT_NAME,
      contentType: "application/octet-stream",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.kind, "pdf");
    assert.equal(result.fileName, "Chadwick Joel Gillion certs.pdf");
    assert.equal(result.contentType, "application/pdf");
  });

  it("rejects a file with no recognisable type and does not double the trailing dot", () => {
    const result = validateCertificateBytes(Buffer.from("this is plain text, not a certificate"), {
      name: INCIDENT_NAME,
      contentType: "",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /no file extension/);
    assert.match(result.error, /not a recognisable certificate type/);
    assert.match(result.error, /Save it as a PDF/);
    assert.match(result.error, /photos of the pages \(JPG or PNG\)/);
    assert.match(result.error, /"Chadwick Joel Gillion certs\."/);
    assert.doesNotMatch(result.error, /certs\.\./);
    assert.doesNotMatch(result.error, /Unsupported certificate format/);

    const named = validateCertificateUploadMeta({
      name: "notes.txt",
      size: 32,
      contentType: "text/plain",
    });
    assert.equal(named.ok, false);
    if (named.ok) return;
    assert.match(named.error, /"notes\.txt" has no recognisable file type/);
    assert.match(named.error, /Save it as a PDF/);
  });

  it("accepts a trailing-dot name on upload-url when the browser MIME is PDF", () => {
    const meta = validateCertificateUploadMeta({
      name: INCIDENT_NAME,
      size: 5_103_032,
      contentType: "application/pdf",
    });
    assert.equal(meta.ok, true);
    if (!meta.ok) return;
    assert.equal(meta.fileName, "Chadwick Joel Gillion certs.pdf");
    assert.equal(meta.contentType, "application/pdf");
    assert.match(
      certificateStagingPath("diver", "upload", meta.fileName),
      /Chadwick_Joel_Gillion_certs\.pdf$/,
    );
  });

  it("sniffs JPEG and DOCX bytes when the name has no extension", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const photo = resolveMissingExtensionCertificate({
      name: "scan",
      contentType: "",
      bytes: jpeg,
    });
    assert.equal(photo.ok, true);
    if (!photo.ok) return;
    assert.equal(photo.kind, "jpg");
    assert.equal(photo.fileName, "scan.jpg");
    assert.equal(photo.contentType, "image/jpeg");

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const page = resolveMissingExtensionCertificate({ name: "page", contentType: "", bytes: png });
    assert.equal(page.ok, true);
    if (!page.ok) return;
    assert.equal(page.kind, "png");
    assert.equal(page.fileName, "page.png");

    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    const webpResult = resolveMissingExtensionCertificate({
      name: "page",
      contentType: "image/webp",
      bytes: webp,
    });
    assert.equal(webpResult.ok, false);

    const docx = readFileSync(mammothFixture);
    const word = validateCertificateBytes(docx, { name: "tickets", contentType: "" });
    assert.equal(word.ok, true);
    if (!word.ok) return;
    assert.equal(word.kind, "docx");
    assert.equal(word.fileName, "tickets.docx");

    const head = resolveMissingExtensionCertificate({
      name: "tickets",
      contentType: "",
      bytes: docx.subarray(0, 512),
      sniffDocxFromZipHead: true,
    });
    assert.equal(head.ok, true);
    if (!head.ok) return;
    assert.equal(head.kind, "docx");
  });

  it("renames a browser File whose name ends with a dot", async () => {
    const file = new File([pdf], INCIDENT_NAME, { type: "" });
    const prepared = await prepareCertificateFileForUpload(file);
    assert.equal("error" in prepared, false);
    if ("error" in prepared) return;
    assert.equal(prepared.file.name, "Chadwick Joel Gillion certs.pdf");
    assert.equal(prepared.file.type, "application/pdf");
  });
});
