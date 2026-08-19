import { generateObject } from "ai";
import { z } from "zod";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import type { SupabaseClient } from "@supabase/supabase-js";
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

const visionSchema = z.object({
  name: z.string().nullable(),
  issuing_body: z.string().nullable(),
  cert_number: z.string().nullable(),
  issue_date: z.string().nullable().describe("YYYY-MM-DD if clearly visible, else null"),
  expiry_date: z.string().nullable().describe("YYYY-MM-DD if clearly visible, else null"),
  visible_text: z.string(),
  unreadable: z.boolean(),
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

export async function extractDatesFromPdfBuffer(bytes: Buffer) {
  const read = await readCertificateBytes(bytes, "document.pdf", "application/pdf");
  return {
    issue_date: read.issue_date,
    expiry_date: read.expiry_date,
    excerpt: read.excerpt,
  };
}

async function readPdfText(bytes: Buffer): Promise<CertificateRead> {
  try {
    const parsed = await pdfParse(bytes);
    const text = parsed.text || "";
    const dates = extractCertificateDates(text);
    const excerpt = text.replace(/\s+/g, " ").trim();
    const hasDates = Boolean(dates.expiry_date || dates.issue_date);
    return normalizeRead({
      ...dates,
      excerpt,
      source: hasDates ? "pdf-text" : "none",
      unreadable: !hasDates && excerpt.length < 40,
    });
  } catch {
    return emptyRead();
  }
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

export async function readCertificateBytes(
  bytes: Buffer,
  filename: string,
  contentType?: string,
): Promise<CertificateRead> {
  const kind = classifyCertificateFile(filename, contentType);
  if (kind === "pdf") {
    const fromText = await readPdfText(bytes);
    if (fromText.expiry_date || fromText.issue_date || !fromText.unreadable) return fromText;
    return fromText;
  }
  if (kind === "jpg" || kind === "png") {
    return readImageWithVision(bytes, kind === "png" ? "image/png" : "image/jpeg");
  }
  return emptyRead();
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
