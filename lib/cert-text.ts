import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { extractCertificateDates } from "@/lib/dates";

export async function extractDatesFromPdfBuffer(bytes: Buffer) {
  try {
    const parsed = await pdfParse(bytes);
    const text = parsed.text || "";
    return {
      ...extractCertificateDates(text),
      excerpt: text.replace(/\s+/g, " ").trim().slice(0, 400),
    };
  } catch {
    return { issue_date: null, expiry_date: null, excerpt: "" };
  }
}
