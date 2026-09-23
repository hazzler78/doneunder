import { generateObject } from "ai";
import { z } from "zod";
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { aiModel, ENGLISH_ONLY_INSTRUCTION } from "@/lib/ai";
import { isAiConfigured } from "@/lib/feature-flags";
import { extractPdfText } from "@/lib/pdf-text";

const MIN_TEXT_CHARS = 80;
const MAX_OCR_PAGES = 6;
const OCR_SCALE = 1.4;

function cleanText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function imageMediaType(bytes: Buffer): "image/jpeg" | "image/png" {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

export async function renderPdfPagesAsImages(
  buffer: Buffer,
  options?: { maxPages?: number; scale?: number },
) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const maxPages = Math.min(pdf.numPages, options?.maxPages ?? MAX_OCR_PAGES);
  const pages: Buffer[] = [];
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const image = await renderPageAsImage(pdf, pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: options?.scale ?? OCR_SCALE,
    });
    pages.push(Buffer.from(image));
  }
  return pages;
}

/** @deprecated Prefer renderPdfPagesAsImages — unpdf returns PNG by default. */
export async function renderPdfPagesAsJpegs(
  buffer: Buffer,
  options?: { maxPages?: number; scale?: number },
) {
  return renderPdfPagesAsImages(buffer, options);
}

async function transcribePdfPages(images: Buffer[]) {
  if (!isAiConfigured() || images.length === 0) return "";
  try {
    const { object } = await generateObject({
      model: aiModel,
      schema: z.object({
        text: z.string(),
      }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `${ENGLISH_ONLY_INSTRUCTION}\n` +
                "These are scanned pages of a commercial diving CV, seaman's book, CDC, or similar document. " +
                "Transcribe all readable text in reading order. Keep names, dates, vessels, ports, employers, and certificate titles. " +
                "Do not invent missing fields. Skip blank or unreadable pages.",
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
    return cleanText(object.text || "");
  } catch (error) {
    console.error("PDF vision transcription failed:", error);
    return "";
  }
}

export async function extractPdfTextOrOcr(buffer: Buffer) {
  const text = await extractPdfText(buffer);
  if (text.length >= MIN_TEXT_CHARS) {
    return { text, source: "pdf-text" as const };
  }

  try {
    const images = await renderPdfPagesAsImages(buffer);
    const ocr = await transcribePdfPages(images);
    if (ocr.length > text.length) {
      return { text: ocr, source: "vision" as const };
    }
  } catch (error) {
    console.error("PDF page render failed:", error);
  }

  return { text, source: text ? ("pdf-text" as const) : ("none" as const) };
}
