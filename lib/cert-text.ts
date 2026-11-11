import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPdfText } from "@/lib/pdf-text";
import { aiModel, ENGLISH_ONLY_INSTRUCTION } from "@/lib/ai";
import { classifyCertificateFile, imageBytesToCertificatePdf } from "@/lib/certificate-pack";
import { logAgentInteraction } from "@/lib/audit";
import { extractCertificateDates, parseFlexibleDate } from "@/lib/dates";
import { certificationDocumentSourceRef } from "@/lib/certification-profile-utils";
import { applyConversationalCvUpdate, getDiverProfile } from "@/lib/diver-profile-service";
import { isAiConfigured } from "@/lib/feature-flags";
import { extractPdfPageTexts } from "@/lib/pdf-text";
import { checkCertificateDates } from "@/lib/cert-lifetime";
import {
  emptyPackReport,
  planPackBatches,
  runPackRead,
  type CertificatePackRead,
  type PackReadOptions,
} from "@/lib/cert-pack-read";

export type { CertificatePackRead, CertificatePackReport } from "@/lib/cert-pack-read";

export type CertificateRead = {
  name: string | null;
  issuing_body: string | null;
  cert_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  excerpt: string;
  source: "pdf-text" | "vision" | "none";
  unreadable: boolean;
  /** Page of the pack the ticket was printed on, when known. */
  page?: number | null;
  /** Set when a read date was rejected (for example expiry before issue). */
  date_warning?: string | null;
};

/** Per model call (one text batch or a few page images), not per file. */
const MAX_MULTI_CERTS = 40;
const MIN_VISION_MAX_EDGE = 1200;

export type CertificateReadContext = {
  actorId?: string;
  filename?: string;
};

export function certificateReadsFromVisionResult(read: CertificateRead): CertificateRead[] {
  return read.unreadable && !read.name && !read.expiry_date && !read.issue_date ? [] : [read];
}

/** Auto-rotate (EXIF), normalize contrast, and upscale small photos before vision. */
export async function prepareCertificateImageForVision(
  bytes: Buffer,
  mediaType: "image/jpeg" | "image/png",
): Promise<{ bytes: Buffer; mediaType: "image/jpeg" | "image/png" }> {
  try {
    const sharp = (await import("sharp")).default;
    const base = sharp(bytes, { failOn: "none" }).rotate();
    const meta = await base.clone().metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const maxEdge = Math.max(width, height);
    let pipeline = base.normalize();
    if (maxEdge > 0 && maxEdge < MIN_VISION_MAX_EDGE) {
      const scale = MIN_VISION_MAX_EDGE / maxEdge;
      pipeline = pipeline.resize(Math.round(width * scale), Math.round(height * scale), {
        fit: "inside",
        withoutEnlargement: false,
      });
    }
    if (mediaType === "image/png") {
      return { bytes: await pipeline.png().toBuffer(), mediaType: "image/png" };
    }
    return {
      bytes: await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
      mediaType: "image/jpeg",
    };
  } catch (error) {
    console.error(
      "Certificate image preprocess failed:",
      error instanceof Error ? error.message : error,
    );
    return { bytes, mediaType };
  }
}

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
  page: z.number().int().nullable().describe("Page number the ticket is printed on, from the page labels. null if unsure."),
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

export function normalizeRead(partial: Partial<CertificateRead> & { excerpt?: string }): CertificateRead {
  const name = partial.name?.trim() || null;
  const dates = checkCertificateDates({
    name,
    issue_date: parseFlexibleDate(partial.issue_date) ?? null,
    expiry_date: parseFlexibleDate(partial.expiry_date) ?? null,
  });
  return {
    name,
    issuing_body: partial.issuing_body?.trim() || null,
    cert_number: partial.cert_number?.trim() || null,
    issue_date: dates.issue_date,
    expiry_date: dates.expiry_date,
    excerpt: (partial.excerpt ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
    source: partial.source ?? "none",
    unreadable: Boolean(partial.unreadable) && !partial.expiry_date && !partial.issue_date && !partial.name,
    page: typeof partial.page === "number" && partial.page > 0 ? partial.page : null,
    date_warning: dates.warning ?? partial.date_warning ?? null,
  };
}

export function dedupeReads(reads: CertificateRead[]): CertificateRead[] {
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
  "It may also contain CV pages, which are not certificates. " +
  "Extract EVERY distinct certificate. One array entry per ticket. " +
  "Do not merge different tickets into one entry. Do not copy a name, issuer, number or date from one ticket to another. " +
  "Do not invent missing fields. Many diving tickets (HSE, IMCA, Norwegian, Danish) have no expiry: leave expiry_date null for those. " +
  "Dates are usually day/month/year (European). Return issue_date and expiry_date as YYYY-MM-DD. " +
  "Keep official certificate titles; translate other wording into English when helpful.";

/** Text of one labelled page inside a batch, for a page-scoped excerpt. */
function pageSection(text: string, page: number | null | undefined, batchPages: number[]) {
  if (!page) return batchPages.length === 1 ? text : "";
  const marker = `=== Page ${page} ===`;
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const after = text.indexOf("=== Page ", start + marker.length);
  return text.slice(start + marker.length, after < 0 ? undefined : after);
}

/** Read certificates from labelled pack text. Throws on reader failure so callers can report it. */
async function extractCertificatesFromText(text: string, pages: number[]): Promise<CertificateRead[]> {
  if (text.trim().length < 40) return [];
  const { object } = await generateObject({
    model: aiModel,
    schema: multiCertSchema,
    prompt:
      `${MULTI_CERT_INSTRUCTIONS}\n` +
      "Each page starts with a label like '=== Page 3 ==='. Set page to the page the ticket is printed on.\n\n" +
      `Text from pages ${pages.join(", ")} of the uploaded certificate pack follows:\n\n` +
      text,
  });
  return (object.certificates || []).map((item) => {
    const page = item.page && pages.includes(item.page) ? item.page : pages.length === 1 ? pages[0] : null;
    return normalizeRead({
      ...item,
      page,
      excerpt: pageSection(text, page, pages),
      source: "pdf-text",
      unreadable: false,
    });
  });
}

function imageMediaType(image: Buffer) {
  return image.length >= 2 && image[0] === 0xff && image[1] === 0xd8 ? ("image/jpeg" as const) : ("image/png" as const);
}

/** Read certificates from rendered page images. Throws on reader failure. */
async function extractCertificatesFromImages(images: Buffer[], pages: number[]): Promise<CertificateRead[]> {
  if (images.length === 0) return [];
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
              `There are ${images.length} page image(s): pages ${pages.join(", ")} of the file, in that order. Read all of them. ` +
              "Set page to the page number the ticket is on. If a page is a different certificate from the previous page, add a new entry.",
          },
          ...images.map((image) => ({
            type: "image" as const,
            image,
            mediaType: imageMediaType(image),
          })),
        ],
      },
    ],
  });
  return (object.certificates || []).map((item) => {
    const page = item.page && pages.includes(item.page) ? item.page : pages.length === 1 ? pages[0] : null;
    return normalizeRead({
      ...item,
      page,
      excerpt: item.name || "",
      source: "vision",
      unreadable: false,
    });
  });
}

export async function extractDatesFromPdfBuffer(bytes: Buffer) {
  const read = await readCertificateBytes(bytes, "document.pdf", "application/pdf");
  return {
    issue_date: read.issue_date,
    expiry_date: read.expiry_date,
    excerpt: read.excerpt,
  };
}

async function readPdfTextSingle(bytes: Buffer, context?: CertificateReadContext): Promise<CertificateRead> {
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
    return readImageWithVision(first, mediaType, context);
  } catch {
    return emptyRead();
  }
}

export type PdfPackDeps = {
  readText?: (text: string, pages: number[]) => Promise<CertificateRead[]>;
  readImages?: (bytes: Buffer, pages: number[]) => Promise<CertificateRead[]>;
  pageTexts?: (bytes: Buffer) => Promise<{ totalPages: number; pages: string[]; error: string | null }>;
  aiConfigured?: () => boolean;
  now?: () => number;
};

async function renderAndReadPages(bytes: Buffer, pages: number[]) {
  const { renderPdfPagesAsImages } = await import("@/lib/pdf-ocr");
  const images = await renderPdfPagesAsImages(bytes, { pages, scale: 1.5 });
  if (images.length !== pages.length) {
    throw new Error(`rendered ${images.length} of ${pages.length} page images`);
  }
  return extractCertificatesFromImages(images, pages);
}

/**
 * Read every page of a PDF pack. Text pages go to the model in labelled batches,
 * scanned pages are rendered and read a few at a time. Skipped or failed pages are reported.
 */
export async function readPdfCertificatePack(
  bytes: Buffer,
  context?: CertificateReadContext,
  options?: PackReadOptions,
  deps?: PdfPackDeps,
): Promise<CertificatePackRead> {
  const label = context?.filename;
  const texts = await (deps?.pageTexts ?? extractPdfPageTexts)(bytes);
  let totalPages = texts.totalPages;
  if (!totalPages && !deps?.pageTexts) {
    const { countPdfPages } = await import("@/lib/pdf-ocr");
    totalPages = await countPdfPages(bytes);
  }
  if (!totalPages) {
    return { reads: [], report: emptyPackReport(0, texts.error ? `Could not open the PDF: ${texts.error}` : "Could not open the PDF.") };
  }

  const aiReady = (deps?.aiConfigured ?? isAiConfigured)();
  if (!aiReady) {
    const single = certificateReadsFromVisionResult(await readPdfTextSingle(bytes, context));
    return {
      reads: single,
      report: {
        ...emptyPackReport(totalPages, "The certificate reader is not configured."),
        pagesFailed: [],
        pagesSkipped: Array.from({ length: totalPages }, (_, index) => index + 1),
      },
    };
  }

  const plan = planPackBatches(texts.pages, totalPages, options);
  const result = await runPackRead(
    plan,
    {
      readText: deps?.readText ?? extractCertificatesFromText,
      readImages: (pages) => (deps?.readImages ? deps.readImages(bytes, pages) : renderAndReadPages(bytes, pages)),
      now: deps?.now,
    },
    { ...options, label },
  );

  if (!result.report.complete) {
    console.error(
      `Certificate pack read incomplete${label ? ` (${label})` : ""}: read ${result.report.pagesRead.length}/${totalPages} pages, ` +
        `skipped ${result.report.pagesSkipped.length}, failed ${result.report.pagesFailed.length}.`,
    );
  }

  // One-page photo-PDF where the multi reader found nothing: keep the single-ticket fallback.
  if (result.reads.length === 0 && totalPages === 1 && result.report.pagesFailed.length === 0 && !deps?.readText) {
    const single = certificateReadsFromVisionResult(await readPdfTextSingle(bytes, context));
    return { reads: single, report: result.report };
  }
  return result;
}

async function runCertificateVisionObject(
  bytes: Buffer,
  mediaType: "image/jpeg" | "image/png",
) {
  return generateObject({
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
}

async function readImageWithVision(
  bytes: Buffer,
  mediaType: "image/jpeg" | "image/png",
  context?: CertificateReadContext,
): Promise<CertificateRead> {
  if (!isAiConfigured()) return emptyRead();
  const prepared = await prepareCertificateImageForVision(bytes, mediaType);
  const label = context?.filename ? ` (${context.filename})` : "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { object } = await runCertificateVisionObject(prepared.bytes, prepared.mediaType);
      const read = normalizeRead({
        name: object.name,
        issuing_body: object.issuing_body,
        cert_number: object.cert_number,
        issue_date: object.issue_date,
        expiry_date: object.expiry_date,
        excerpt: object.visible_text,
        source: "vision",
        unreadable: object.unreadable,
      });
      if (read.unreadable && !read.name && !read.expiry_date && !read.issue_date) {
        console.error(
          `Certificate vision marked unreadable${label}:`,
          read.excerpt.slice(0, 160) || "(no visible text returned)",
        );
      }
      return read;
    } catch (error) {
      console.error(
        `Certificate vision read failed${label}${attempt === 0 ? ", retrying once" : ""}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return emptyRead();
}

async function readAllFromImageBytes(
  bytes: Buffer,
  filename: string,
  kind: "jpg" | "png",
  context?: CertificateReadContext,
): Promise<CertificateRead[]> {
  const mediaType = kind === "png" ? "image/png" : "image/jpeg";
  let reads = certificateReadsFromVisionResult(await readImageWithVision(bytes, mediaType, context));
  if (reads.length > 0) return reads;

  let pdfFallbackTried = false;
  try {
    pdfFallbackTried = true;
    const pdfBytes = await imageBytesToCertificatePdf(bytes, kind);
    reads = (await readPdfCertificatePack(pdfBytes, context)).reads;
    if (reads.length > 0) {
      console.error(
        `Certificate vision read empty for ${filename}; PDF fallback extracted ${reads.length} ticket(s).`,
      );
      return reads;
    }
  } catch (error) {
    console.error(
      `Certificate PDF fallback read failed for ${filename}:`,
      error instanceof Error ? error.message : error,
    );
  }

  if (context?.actorId) {
    await logAgentInteraction({
      actorId: context.actorId,
      feature: "cert_vision_zero_read",
      input: {
        filename,
        bytes: bytes.length,
        pdfFallbackTried,
      },
      output: {
        ticketCount: 0,
        source: "vision",
      },
    });
  }

  return [];
}

/** Read every certificate in a file and report how much of it was read. */
export async function readCertificatePack(
  bytes: Buffer,
  filename: string,
  contentType?: string,
  context?: CertificateReadContext,
  options?: PackReadOptions,
): Promise<CertificatePackRead> {
  const readContext = { ...context, filename: context?.filename ?? filename };
  const kind = classifyCertificateFile(filename, contentType);
  if (kind === "pdf") {
    return readPdfCertificatePack(bytes, readContext, options);
  }
  if (kind === "jpg" || kind === "png") {
    const reads = await readAllFromImageBytes(bytes, filename, kind, readContext);
    return {
      reads,
      report: {
        totalPages: null,
        pagesRead: [],
        pagesSkipped: [],
        pagesFailed: [],
        errors: reads.length ? [] : ["No ticket could be read from the photo."],
        complete: reads.length > 0,
      },
    };
  }
  if (kind === "doc" || kind === "docx") {
    try {
      const { extractTextFromWordBytes } = await import("@/lib/word-text");
      const extracted = await extractTextFromWordBytes(bytes, filename);
      if (extracted.text.trim().length < 40 || !isAiConfigured()) {
        return {
          reads: [],
          report: { ...emptyPackReport(null, "No readable text in the Word file."), totalPages: null },
        };
      }
      const plan = planPackBatches([extracted.text], 1, options);
      const result = await runPackRead(
        plan,
        { readText: extractCertificatesFromText, readImages: async () => [] },
        { ...options, label: filename },
      );
      return { reads: result.reads, report: { ...result.report, totalPages: null } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Certificate Word read failed (${filename}):`, message.slice(0, 160));
      return { reads: [], report: { ...emptyPackReport(null, `Could not read the Word file: ${message.slice(0, 160)}`) } };
    }
  }
  return { reads: [], report: emptyPackReport(null, "Unsupported certificate file type.") };
}

/** Read every distinct certificate from a PDF/JPG/PNG/Word file (multi-ticket packs supported). */
export async function readAllCertificatesFromBytes(
  bytes: Buffer,
  filename: string,
  contentType?: string,
  context?: CertificateReadContext,
): Promise<CertificateRead[]> {
  return (await readCertificatePack(bytes, filename, contentType, context)).reads;
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

export function certificationNameMatchesDiver(name: string, diverFullName?: string | null) {
  if (!diverFullName?.trim() || !name.trim()) return false;
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z]+/g, " ")
      .trim();
  const left = normalize(name);
  const right = normalize(diverFullName);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = left.split(/\s+/).filter(Boolean);
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  if (leftTokens.length < 2 || rightTokens.size < 2) return false;
  const hits = leftTokens.filter((token) => rightTokens.has(token)).length;
  return hits >= 2 || (hits === leftTokens.length && leftTokens.length >= 2);
}

/** Fix AI/OCR cert rows that used the diver's name instead of the ticket title. */
export function sanitizeParsedCertificationName(
  name: string,
  issuingBody?: string | null,
  diverFullName?: string | null,
) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return trimmed;
  const bad = looksLikePersonName(trimmed) || certificationNameMatchesDiver(trimmed, diverFullName);
  if (!bad) return trimmed;
  const inferred = inferCertificateTitle({
    name: trimmed,
    issuingBody,
  });
  if (inferred) return inferred;
  const body = issuingBody?.trim();
  if (body && !looksLikePersonName(body)) {
    const fromBody = inferCertificateTitle({ issuingBody: body });
    return fromBody ?? body;
  }
  return trimmed;
}

function looksLikePersonName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/^(mr|mrs|ms|miss|dr)\b/i.test(trimmed)) return true;
  if (/^[A-Z]{2,}[,\s]+[A-Z]/.test(trimmed) && !/\b(IMCA|HSE|OPITO|DMT|BOSIET|FOET|IDSA)\b/i.test(trimmed)) {
    return true;
  }
  if (
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+){1,4}$/.test(trimmed) &&
    !/\b(diver|medic|medical|certificate|ticket|diving|first aid|oxygen|supervisor|bosiet|foet|imca|hse|opito|a\.?e\.?d|providers)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/** When OCR labels a ticket with the diver's name, recover the real title from body/filename/text. */
export function inferCertificateTitle(input: {
  name?: string | null;
  issuingBody?: string | null;
  excerpt?: string | null;
  fallbackName?: string | null;
}) {
  const blob = [input.name, input.issuingBody, input.excerpt, input.fallbackName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\b(dmt|diver\s*medic|trauma\s*training|idm\/\d+)\b/.test(blob)) {
    return "Diver Medic Technician (DMT)";
  }
  if (/\bfoet\b/.test(blob)) return "OPITO FOET";
  if (/\bbosiet\b/.test(blob)) return "OPITO BOSIET";
  if (/\b(oeuk|oguk)\b/.test(blob) && /\bmedical\b/.test(blob)) return "OEUK Medical";
  if (/\b(hse|imca)\b/.test(blob) && /\bmedical\b/.test(blob)) return "HSE Diver Medical";
  if (/\bsurface\s*supplied\b/.test(blob) || /\btop\s*[- ]?up\b/.test(blob)) {
    return "IMCA Surface Supplied (Top Up)";
  }
  if (/\bclosed\s*bell\b/.test(blob)) return "IMCA Closed Bell";
  return null;
}

function normalizedTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedNumber(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isMedicalTitle(value: string) {
  return /\bmedical\b/.test(value) && !/\btechnician\b/.test(value);
}

/**
 * Decide whether a read is the same ticket as a stored row. Strict on purpose: the old
 * token-overlap score (threshold 45) merged different tickets and mixed issuers and names.
 * Same cert number, or the same title (and no conflicting cert number / issuer), counts.
 */
export function certificateReadMatchesStoredTicket(
  stored: { name: string; cert_number?: string | null; issuing_body?: string | null },
  candidate: { names: string[]; cert_number?: string | null; issuing_body?: string | null },
) {
  const storedNumber = normalizedNumber(stored.cert_number);
  const readNumber = normalizedNumber(candidate.cert_number);
  if (storedNumber && readNumber) return storedNumber === readNumber;

  const storedTitle = normalizedTitle(stored.name);
  if (!storedTitle) return false;
  const sameTitle = candidate.names.some((name) => normalizedTitle(name) === storedTitle);
  if (!sameTitle) return false;
  if (isMedicalTitle(storedTitle) !== candidate.names.some((name) => isMedicalTitle(normalizedTitle(name)))) {
    return false;
  }
  const storedBody = normalizedTitle(stored.issuing_body);
  const readBody = normalizedTitle(candidate.issuing_body);
  if (storedBody && readBody && storedBody !== readBody && !storedBody.includes(readBody) && !readBody.includes(storedBody)) {
    return false;
  }
  return true;
}

function cleanIssuingBody(text: string | null | undefined) {
  if (!text?.trim()) return null;
  return text
    .replace(
      /\s*[-–]?\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*(?:expiry|expires|valid until|valid to|to)\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*/gi,
      " ",
    )
    .replace(/\s*(?:expiry|expires|valid until|valid to)[:\s\-]*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s[-–]\s*$/g, "")
    .trim() || null;
}

/** Rename person-name cert rows using issuing body / notes when we can infer the real ticket. */
export async function repairMisnamedCertifications(
  supabase: SupabaseClient,
  diverId: string,
) {
  const profile = await getDiverProfile(supabase, diverId);
  const updates: Array<{ match: { name: string }; patch: { name: string } }> = [];

  const { data: userRow } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", diverId)
    .maybeSingle();
  const diverFullName =
    typeof userRow?.full_name === "string" ? userRow.full_name : profile.profile.polished_cv_json?.full_name;

  for (const cert of profile.certifications) {
    if (!looksLikePersonName(cert.name) && !certificationNameMatchesDiver(cert.name, diverFullName)) continue;
    const inferred = inferCertificateTitle({
      name: cert.name,
      issuingBody: cert.issuing_body,
    });
    if (!inferred || inferred === cert.name) continue;
    updates.push({ match: { name: cert.name }, patch: { name: inferred } });
  }

  if (updates.length === 0) {
    return { ok: true as const, repaired: 0, profile };
  }

  const result = await applyConversationalCvUpdate(
    supabase,
    diverId,
    { update_certifications: updates },
    { sourceRef: "source: cert-title-repair" },
  );
  return {
    ok: result.ok,
    repaired: result.ok ? updates.length : 0,
    errors: result.errors,
    profile: result.profile,
  };
}

/** Lift issue/expiry dates that were stuck in issuing_body text into proper date fields. */
export async function repairCertificationDatesFromProfileText(
  supabase: SupabaseClient,
  diverId: string,
) {
  const profile = await getDiverProfile(supabase, diverId);
  const updates: Array<{ match: { name: string }; patch: Record<string, string | null | undefined> }> = [];

  for (const cert of profile.certifications) {
    if (cert.expiry_date && cert.issue_date) continue;
    const blob = [cert.issuing_body, cert.cert_number, cert.name].filter(Boolean).join(" ");
    const dates = extractCertificateDates(blob);
    if (!dates.expiry_date && !dates.issue_date) continue;
    const patch: Record<string, string | null | undefined> = {};
    if (!cert.expiry_date && dates.expiry_date) patch.expiry_date = dates.expiry_date;
    if (!cert.issue_date && dates.issue_date) patch.issue_date = dates.issue_date;
    if (cert.issuing_body && (patch.expiry_date || patch.issue_date)) {
      patch.issuing_body = cleanIssuingBody(cert.issuing_body);
    }
    if (Object.keys(patch).length === 0) continue;
    updates.push({ match: { name: cert.name }, patch });
  }

  if (updates.length === 0) {
    return { ok: true as const, repaired: 0, profile };
  }

  const result = await applyConversationalCvUpdate(
    supabase,
    diverId,
    { update_certifications: updates },
    { sourceRef: "source: cert-date-repair" },
  );
  return {
    ok: result.ok,
    repaired: result.ok ? updates.length : 0,
    errors: result.errors,
    profile: result.profile,
  };
}

export type ApplyCertificateReadOptions = {
  /** Also match rows created from these source refs (for example the CV import of the same file). */
  extraSourceRefs?: string[];
};

export async function applyCertificateRead(
  supabase: SupabaseClient,
  diverId: string,
  read: CertificateRead,
  fallbackName: string,
  sourceFilePath?: string,
  options?: ApplyCertificateReadOptions,
) {
  if (!read.expiry_date && !read.issue_date && !read.name) {
    return { ok: false as const, error: "No certificate fields to save." };
  }

  // Dates often arrive only inside issuing_body / OCR excerpt (page-scoped for packs).
  // A date the reader already rejected (expiry before issue) is not re-lifted from the text.
  const fromText = read.date_warning
    ? { issue_date: null, expiry_date: null }
    : extractCertificateDates([read.issuing_body, read.excerpt, read.name].filter(Boolean).join(" "));
  const checkedDates = checkCertificateDates({
    name: read.name,
    issue_date: read.issue_date || fromText.issue_date,
    expiry_date: read.expiry_date || fromText.expiry_date,
  });
  const issue_date = checkedDates.issue_date;
  const expiry_date = checkedDates.expiry_date;
  const dateWarning = read.date_warning ?? checkedDates.warning;
  const issuing_body = cleanIssuingBody(read.issuing_body) ?? read.issuing_body ?? undefined;

  const rawName = (read.name || fallbackName.replace(/\.[a-z0-9]+$/i, "")).trim();
  const inferredName = inferCertificateTitle({
    name: rawName,
    issuingBody: issuing_body,
    excerpt: read.excerpt,
    fallbackName,
  });
  const candidateName =
    looksLikePersonName(rawName) && inferredName ? inferredName : rawName || inferredName || "";
  if (!candidateName) {
    return { ok: false as const, error: "Skipped scan with no usable ticket name." };
  }
  if (looksLikePersonName(candidateName) && !expiry_date && !issue_date) {
    return { ok: false as const, error: `Skipped person-name label "${candidateName}".` };
  }

  const profile = await getDiverProfile(supabase, diverId);
  const fileSourceRef = sourceFilePath ? certificationDocumentSourceRef(sourceFilePath) : undefined;
  const allowedRefs = new Set([fileSourceRef, ...(options?.extraSourceRefs ?? [])].filter(Boolean));
  const candidates = fileSourceRef
    ? profile.certifications.filter((cert) => cert.source_ref && allowedRefs.has(cert.source_ref))
    : profile.certifications;

  const names = [candidateName, rawName, inferredName].filter((name): name is string => Boolean(name));
  const matches = candidates.filter((cert) =>
    certificateReadMatchesStoredTicket(cert, {
      names,
      cert_number: read.cert_number,
      issuing_body: issuing_body ?? null,
    }),
  );
  // Two stored rows with the same title (e.g. an old and a renewed medical): only update when
  // the dates point at one of them, otherwise add a new row rather than overwrite the wrong one.
  let bestCert: (typeof profile.certifications)[number] | null = null;
  if (matches.length === 1) {
    bestCert = matches[0];
  } else if (matches.length > 1) {
    bestCert =
      matches.find((cert) => (expiry_date && cert.expiry_date === expiry_date) || (issue_date && cert.issue_date === issue_date)) ??
      null;
  }

  const patchFields: Partial<{
    name: string;
    issuing_body: string;
    cert_number: string;
    issue_date: string;
    expiry_date: string;
    expiry_confirmed: boolean;
    source_ref: string;
  }> = {};

  if (issuing_body) patchFields.issuing_body = issuing_body;
  if (read.cert_number?.trim()) patchFields.cert_number = read.cert_number.trim();
  if (issue_date) patchFields.issue_date = issue_date;
  if (expiry_date) {
    patchFields.expiry_date = expiry_date;
    patchFields.expiry_confirmed = false;
  }
  if (fileSourceRef) patchFields.source_ref = fileSourceRef;

  if (bestCert) {
    const updated = await applyConversationalCvUpdate(
      supabase,
      diverId,
      { update_certifications: [{ match: { id: bestCert.id! }, patch: patchFields }] },
      { sourceRef: "source: cert-read" },
    );
    if (updated.ok) {
      return { ok: true as const, mode: "updated" as const, read, matched: bestCert.name, warning: dateWarning ?? undefined };
    }
    return {
      ok: false as const,
      error: updated.errors.join("; ") || `Could not update "${bestCert.name}".`,
      read,
    };
  }

  if (looksLikePersonName(candidateName)) {
    return {
      ok: false as const,
      error: `Could not match scan "${candidateName}" to an existing ticket.`,
      read,
    };
  }

  if (!read.name && !expiry_date) {
    return { ok: false as const, error: "Nothing to add — missing ticket name and expiry." };
  }

  const added = await applyConversationalCvUpdate(
    supabase,
    diverId,
    {
      add_certifications: [
        {
          name: candidateName,
          issuing_body,
          cert_number: read.cert_number?.trim() || undefined,
          issue_date: issue_date ?? undefined,
          expiry_date: expiry_date ?? undefined,
          ...(expiry_date ? { expiry_confirmed: false as const } : {}),
          ...(fileSourceRef ? { source_ref: fileSourceRef } : {}),
        },
      ],
    },
    { sourceRef: "source: cert-read" },
  );
  return {
    ok: added.ok,
    mode: "added" as const,
    read,
    warning: dateWarning ?? undefined,
    error: added.ok ? undefined : added.errors.join("; ") || "Could not add certification.",
  };
}

export async function applyCertificateReads(
  supabase: SupabaseClient,
  diverId: string,
  reads: CertificateRead[],
  fallbackName: string,
  sourceFilePath?: string,
  options?: ApplyCertificateReadOptions,
) {
  const results = [];
  for (const read of reads) {
    results.push(await applyCertificateRead(supabase, diverId, read, fallbackName, sourceFilePath, options));
  }
  return {
    ok: results.some((item) => item.ok),
    applied: results.filter((item) => item.ok).length,
    errors: results
      .map((item) => ("error" in item ? item.error : null))
      .filter((item): item is string => Boolean(item)),
    warnings: results
      .map((item) => ("warning" in item ? item.warning : null))
      .filter((item): item is string => Boolean(item)),
    results,
  };
}
