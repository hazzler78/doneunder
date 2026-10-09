import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPdfText } from "@/lib/pdf-text";
import { aiModel, ENGLISH_ONLY_INSTRUCTION } from "@/lib/ai";
import { classifyCertificateFile, imageBytesToCertificatePdf } from "@/lib/certificate-pack";
import { extractCertificateDates, parseFlexibleDate } from "@/lib/dates";
import { applyConversationalCvUpdate } from "@/lib/diver-profile-service";
import { isAiConfigured } from "@/lib/feature-flags";

export type CertificateRead = {
  name: string | null;
  issuing_body: string | null;
  cert_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  excerpt: string;
  source: "pdf-text" | "vision" | "none";
  unreadable: boolean;
};

const MAX_MULTI_CERTS = 20;
const MAX_VISION_PAGES = 8;

const visionSchema = z.object({
  name: z.string().nullable(),
  issuing_body: z.string().nullable(),
  cert_number: z.string().nullable(),
  issue_date: z.string().nullable().describe("YYYY-MM-DD if clearly visible, else null"),
  expiry_date: z.string().nullable().describe("YYYY-MM-DD if clearly visible, else null"),
  visible_text: z.string(),
  unreadable: z.boolean(),
});

const certFieldsSchema = z.object({
  name: z.string().min(2).describe("Certificate title, e.g. IMCA Diver, FOET with CA-EBS, HSE Diver Medical"),
  issuing_body: z.string().nullable(),
  cert_number: z.string().nullable(),
  issue_date: z.string().nullable().describe("YYYY-MM-DD if clearly visible, else null"),
  expiry_date: z.string().nullable().describe("YYYY-MM-DD if clearly visible, else null"),
});

const multiCertSchema = z.object({
  certificates: z
    .array(certFieldsSchema)
    .max(MAX_MULTI_CERTS)
    .describe("Every distinct certificate found in the document. One entry per ticket."),
});

function emptyRead(): CertificateRead {
  return {
    name: null,
    issuing_body: null,
    cert_number: null,
    issue_date: null,
    expiry_date: null,
    excerpt: "",
    source: "none",
    unreadable: true,
  };
}

function normalizeRead(partial: Partial<CertificateRead> & { excerpt?: string }): CertificateRead {
  return {
    name: partial.name?.trim() || null,
    issuing_body: partial.issuing_body?.trim() || null,
    cert_number: partial.cert_number?.trim() || null,
    issue_date: parseFlexibleDate(partial.issue_date) ?? null,
    expiry_date: parseFlexibleDate(partial.expiry_date) ?? null,
    excerpt: (partial.excerpt ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
    source: partial.source ?? "none",
    unreadable: Boolean(partial.unreadable) && !partial.expiry_date && !partial.issue_date && !partial.name,
  };
}

function dedupeReads(reads: CertificateRead[]): CertificateRead[] {
  const seen = new Set<string>();
  const out: CertificateRead[] = [];
  for (const read of reads) {
    if (!read.name && !read.expiry_date && !read.issue_date) continue;
    const key = [
      (read.name || "").toLowerCase(),
      read.cert_number || "",
      read.expiry_date || "",
      read.issue_date || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(read);
  }
  return out;
}

const MULTI_CERT_INSTRUCTIONS =
  `${ENGLISH_ONLY_INSTRUCTION}\n` +
  "This document may contain ONE or MANY commercial diving certificates in a single file " +
  "(for example IMCA diver ticket, BOSIET/FOET, DMT, OEUK/HSE medical, Escape Chute, and more). " +
  "Extract EVERY distinct certificate. One array entry per ticket. " +
  "Do not merge different tickets into one entry. Do not invent missing fields. " +
  "Dates are usually day/month/year (European). Return issue_date and expiry_date as YYYY-MM-DD. " +
  "Keep official certificate titles; translate other wording into English when helpful.";

async function extractMultipleFromText(text: string): Promise<CertificateRead[]> {
  if (!isAiConfigured() || text.trim().length < 40) return [];
  try {
    const { object } = await generateObject({
      model: aiModel,
      schema: multiCertSchema,
      prompt:
        `${MULTI_CERT_INSTRUCTIONS}\n\n` +
        "OCR / PDF text from the uploaded certificate pack follows:\n\n" +
        text.slice(0, 24_000),
    });
    return dedupeReads(
      (object.certificates || []).map((item) =>
        normalizeRead({
          ...item,
          excerpt: text.slice(0, 400),
          source: "pdf-text",
          unreadable: false,
        }),
      ),
    );
  } catch {
    return [];
  }
}

async function extractMultipleFromImages(images: Buffer[]): Promise<CertificateRead[]> {
  if (!isAiConfigured() || images.length === 0) return [];
  try {
    const { object } = await generateObject({
      model: aiModel,
      schema: multiCertSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `${MULTI_CERT_INSTRUCTIONS}\n` +
                `There are ${images.length} page image(s). Read all of them. ` +
                "If a page is a different certificate from the previous page, add a new entry.",
            },
            ...images.map((image) => ({
              type: "image" as const,
              image,
              mediaType:
                image.length >= 2 && image[0] === 0xff && image[1] === 0xd8
                  ? ("image/jpeg" as const)
                  : ("image/png" as const),
            })),
          ],
        },
      ],
    });
    return dedupeReads(
      (object.certificates || []).map((item) =>
        normalizeRead({
          ...item,
          excerpt: item.name || "",
          source: "vision",
          unreadable: false,
        }),
      ),
    );
  } catch {
    return [];
  }
}

export async function extractDatesFromPdfBuffer(bytes: Buffer) {
  const read = await readCertificateBytes(bytes, "document.pdf", "application/pdf");
  return {
    issue_date: read.issue_date,
    expiry_date: read.expiry_date,
    excerpt: read.excerpt,
  };
}

async function readPdfTextSingle(bytes: Buffer): Promise<CertificateRead> {
  try {
    const text = await extractPdfText(bytes);
    const dates = extractCertificateDates(text);
    const excerpt = text.replace(/\s+/g, " ").trim();
    const hasDates = Boolean(dates.expiry_date || dates.issue_date);
    if (hasDates || excerpt.length >= 40) {
      return normalizeRead({
        ...dates,
        excerpt,
        source: "pdf-text",
        unreadable: false,
      });
    }
  } catch {
    // Fall through to a rendered first-page vision read.
  }

  try {
    const { renderPdfPagesAsImages } = await import("@/lib/pdf-ocr");
    const pages = await renderPdfPagesAsImages(bytes, { maxPages: 1, scale: 1.6 });
    const first = pages[0];
    if (!first) return emptyRead();
    const mediaType = first.length >= 2 && first[0] === 0xff && first[1] === 0xd8 ? "image/jpeg" : "image/png";
    return readImageWithVision(first, mediaType);
  } catch {
    return emptyRead();
  }
}

async function readAllFromPdf(bytes: Buffer): Promise<CertificateRead[]> {
  let text = "";
  try {
    text = await extractPdfText(bytes);
  } catch {
    text = "";
  }

  if (text.trim().length >= 80) {
    const fromText = await extractMultipleFromText(text);
    if (fromText.length > 0) return fromText;
  }

  try {
    const { renderPdfPagesAsImages } = await import("@/lib/pdf-ocr");
    const pages = await renderPdfPagesAsImages(bytes, { maxPages: MAX_VISION_PAGES, scale: 1.5 });
    const fromVision = await extractMultipleFromImages(pages);
    if (fromVision.length > 0) return fromVision;
  } catch {
    // Fall through to legacy single-cert path.
  }

  const single = await readPdfTextSingle(bytes);
  return single.unreadable && !single.name && !single.expiry_date && !single.issue_date ? [] : [single];
}

async function readImageWithVision(bytes: Buffer, mediaType: "image/jpeg" | "image/png"): Promise<CertificateRead> {
  if (!isAiConfigured()) return emptyRead();
  try {
    const { object } = await generateObject({
      model: aiModel,
      schema: visionSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `${ENGLISH_ONLY_INSTRUCTION}\n` +
                "This is a photo of a commercial diving certificate or medical. " +
                "The document may be in any language. Read it carefully and translate field values into English where needed, " +
                "but keep official certificate titles and proper names as printed when that is clearer. " +
                "Extract only what is clearly printed. Do not guess. " +
                "Dates are usually day/month/year (European). Return issue_date and expiry_date as YYYY-MM-DD. " +
                "If a field is blurry or missing, use null and set unreadable true if you cannot read the document.",
            },
            { type: "image", image: bytes, mediaType },
          ],
        },
      ],
    });
    return normalizeRead({
      name: object.name,
      issuing_body: object.issuing_body,
      cert_number: object.cert_number,
      issue_date: object.issue_date,
      expiry_date: object.expiry_date,
      excerpt: object.visible_text,
      source: "vision",
      unreadable: object.unreadable,
    });
  } catch {
    return emptyRead();
  }
}

/** Read every distinct certificate from a PDF/JPG/PNG (multi-ticket packs supported). */
export async function readAllCertificatesFromBytes(
  bytes: Buffer,
  filename: string,
  contentType?: string,
): Promise<CertificateRead[]> {
  const kind = classifyCertificateFile(filename, contentType);
  if (kind === "pdf") {
    return readAllFromPdf(bytes);
  }
  if (kind === "jpg" || kind === "png") {
    const read = await readImageWithVision(bytes, kind === "png" ? "image/png" : "image/jpeg");
    return read.unreadable && !read.name && !read.expiry_date && !read.issue_date ? [] : [read];
  }
  return [];
}

/** Legacy single-cert helper — returns the first ticket found (or an empty read). */
export async function readCertificateBytes(
  bytes: Buffer,
  filename: string,
  contentType?: string,
): Promise<CertificateRead> {
  const all = await readAllCertificatesFromBytes(bytes, filename, contentType);
  return all[0] ?? emptyRead();
}

export async function pdfCopyFromImage(bytes: Buffer, filename: string, contentType?: string) {
  const kind = classifyCertificateFile(filename, contentType);
  if (kind !== "jpg" && kind !== "png") return null;
  try {
    return await imageBytesToCertificatePdf(bytes, kind);
  } catch {
    return null;
  }
}

export async function applyCertificateRead(
  supabase: SupabaseClient,
  diverId: string,
  read: CertificateRead,
  fallbackName: string,
) {
  if (!read.expiry_date && !read.issue_date && !read.name) return { ok: false as const };
  const matchName = read.name || fallbackName.replace(/\.[a-z0-9]+$/i, "");
  const patch = {
    name: read.name ?? undefined,
    issuing_body: read.issuing_body ?? undefined,
    cert_number: read.cert_number ?? undefined,
    issue_date: read.issue_date ?? undefined,
    expiry_date: read.expiry_date ?? undefined,
  };
  const updated = await applyConversationalCvUpdate(
    supabase,
    diverId,
    { update_certifications: [{ match: { name: matchName }, patch }] },
    { sourceRef: "source: cert-read" },
  );
  if (updated.ok) return { ok: true as const, mode: "updated" as const, read };
  if (!read.name && !read.expiry_date) return { ok: false as const };
  const added = await applyConversationalCvUpdate(
    supabase,
    diverId,
    {
      add_certifications: [
        {
          name: read.name || matchName,
          issuing_body: read.issuing_body ?? undefined,
          cert_number: read.cert_number ?? undefined,
          issue_date: read.issue_date ?? undefined,
          expiry_date: read.expiry_date ?? undefined,
        },
      ],
    },
    { sourceRef: "source: cert-read" },
  );
  return { ok: added.ok, mode: "added" as const, read };
}

export async function applyCertificateReads(
  supabase: SupabaseClient,
  diverId: string,
  reads: CertificateRead[],
  fallbackName: string,
) {
  const results = [];
  for (const read of reads) {
    results.push(await applyCertificateRead(supabase, diverId, read, fallbackName));
  }
  return {
    ok: results.some((item) => item.ok),
    applied: results.filter((item) => item.ok).length,
    results,
  };
}
