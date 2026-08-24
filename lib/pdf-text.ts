import { PDFDocument } from "pdf-lib";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

async function rewritePdf(bytes: Buffer) {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return Buffer.from(await doc.save());
  } catch {
    return null;
  }
}

async function parseOnce(bytes: Buffer) {
  const parsed = await pdfParse(bytes);
  return cleanText(parsed.text || "");
}

/**
 * pdf-parse 1.1.1 (old pdf.js) throws "bad XRef entry" on some ReportLab/modern
 * PDFs on the first attempt. Rewriting with pdf-lib, then retrying, recovers text.
 */
export async function extractPdfText(buffer: Buffer) {
  const candidates = [buffer];
  const rewritten = await rewritePdf(buffer);
  if (rewritten && rewritten.length > 0) candidates.push(rewritten);

  let lastError: unknown;
  for (const bytes of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await parseOnce(bytes);
        if (text) return text;
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError) {
    console.error("PDF text extraction failed:", lastError);
  }
  return "";
}
