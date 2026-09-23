import { PDFDocument } from "pdf-lib";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { extractText, getDocumentProxy } from "unpdf";

const USEFUL_TEXT_CHARS = 40;

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

/** Chrome/Skia Type3 dumps often arrive as one character per line. */
export function joinSingleCharacterLines(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 8) return input;
  const singles = lines.filter((line) => line.length === 1).length;
  if (singles / lines.length < 0.6) return input;
  return lines.join("");
}

async function rewritePdf(bytes: Buffer) {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return Buffer.from(await doc.save());
  } catch {
    return null;
  }
}

async function extractWithUnpdf(bytes: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return cleanText(joinSingleCharacterLines(text || ""));
}

async function extractWithPdfParse(bytes: Buffer) {
  const parsed = await pdfParse(bytes);
  return cleanText(joinSingleCharacterLines(parsed.text || ""));
}

/**
 * Prefer unpdf (modern PDF.js, works in serverless). Fall back to rewriting
 * with pdf-lib + pdf-parse 1.1.1 for ReportLab "bad XRef" files.
 */
export async function extractPdfText(buffer: Buffer) {
  const candidates = [buffer];
  const rewritten = await rewritePdf(buffer);
  if (rewritten && rewritten.length > 0) candidates.push(rewritten);

  let lastError: unknown;
  let best = "";

  for (const bytes of candidates) {
    for (const extractor of [extractWithUnpdf, extractWithPdfParse]) {
      try {
        const text = await extractor(bytes);
        if (text.length > best.length) best = text;
        if (best.length >= USEFUL_TEXT_CHARS) return best;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!best && lastError) {
    console.error("PDF text extraction failed:", lastError);
  }
  return best;
}
