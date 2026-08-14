import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument, PageSizes } from "pdf-lib";

export type CertificatePackSource = {
  name: string;
  bytes: Buffer;
  contentType?: string;
};

const A4 = PageSizes.A4;
const MARGIN = 28;
const MAX_IMAGE_EDGE = 2000;

export function classifyCertificateFile(name: string, contentType?: string) {
  const lower = name.toLowerCase();
  const type = (contentType ?? "").toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) return "pdf" as const;
  if (type === "image/png" || lower.endsWith(".png")) return "png" as const;
  if (type === "image/jpeg" || type === "image/jpg" || /\.jpe?g$/.test(lower)) return "jpg" as const;
  if (type === "image/webp" || lower.endsWith(".webp")) return "webp" as const;
  return null;
}

/** Read JPEG EXIF orientation (1–8). Returns 1 when missing. */
export function jpegExifOrientation(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const size = bytes.readUInt16BE(offset + 2);
    if (marker === 0xe1 && offset + 4 + size <= bytes.length) {
      const start = offset + 4;
      if (bytes.toString("ascii", start, start + 4) !== "Exif") break;
      const tiff = start + 6;
      const little = bytes.toString("ascii", tiff, tiff + 2) === "II";
      const read16 = (pos: number) => (little ? bytes.readUInt16LE(pos) : bytes.readUInt16BE(pos));
      const read32 = (pos: number) => (little ? bytes.readUInt32LE(pos) : bytes.readUInt32BE(pos));
      const ifd = tiff + read32(tiff + 4);
      if (ifd + 2 > bytes.length) break;
      const entries = read16(ifd);
      for (let i = 0; i < entries; i += 1) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) break;
        if (read16(entry) === 0x0112) {
          const value = read16(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      break;
    }
    if (size < 2) break;
    offset += 2 + size;
  }
  return 1;
}

async function normalizeImageForPdf(bytes: Buffer, kind: "jpg" | "png" | "webp") {
  const image = await loadImage(bytes);
  const orientation = kind === "jpg" ? jpegExifOrientation(bytes) : 1;
  const swapped = orientation >= 5 && orientation <= 8;
  let width = image.width;
  let height = image.height;
  const longest = Math.max(width, height);
  const scale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvasWidth = swapped ? height : width;
  const canvasHeight = swapped ? width : height;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");
  ctx.save();
  switch (orientation) {
    case 2:
      ctx.translate(canvasWidth, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(canvasWidth, canvasHeight);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, canvasHeight);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.translate(canvasWidth, 0);
      ctx.rotate(0.5 * Math.PI);
      break;
    case 7:
      ctx.translate(canvasWidth, canvasHeight);
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 8:
      ctx.translate(0, canvasHeight);
      ctx.rotate(-0.5 * Math.PI);
      break;
    default:
      break;
  }
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();
  return canvas.toBuffer("image/jpeg", 85);
}

async function appendPdfPages(target: PDFDocument, bytes: Buffer) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await target.copyPages(source, source.getPageIndices());
  for (const page of pages) target.addPage(page);
  return pages.length;
}

async function embedRaster(target: PDFDocument, bytes: Buffer, kind: "jpg" | "png" | "webp") {
  try {
    const normalized = await normalizeImageForPdf(bytes, kind);
    return target.embedJpg(normalized);
  } catch {
    if (kind === "png") return target.embedPng(bytes);
    if (kind === "jpg") return target.embedJpg(bytes);
    throw new Error("Could not embed image");
  }
}

async function appendImagePage(target: PDFDocument, bytes: Buffer, kind: "jpg" | "png" | "webp") {
  const image = await embedRaster(target, bytes, kind);
  const landscape = image.width > image.height;
  const pageWidth = landscape ? A4[1] : A4[0];
  const pageHeight = landscape ? A4[0] : A4[1];
  const page = target.addPage([pageWidth, pageHeight]);
  const maxW = pageWidth - MARGIN * 2;
  const maxH = pageHeight - MARGIN * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  });
  return 1;
}

export async function buildCertificatePackPdf(sources: CertificatePackSource[]) {
  const doc = await PDFDocument.create();
  doc.setTitle("Certificates");
  doc.setProducer("doneunder.ai");
  let pages = 0;
  const skipped: string[] = [];

  for (const source of sources) {
    const kind = classifyCertificateFile(source.name, source.contentType);
    if (!kind) {
      skipped.push(source.name);
      continue;
    }
    try {
      if (kind === "pdf") pages += await appendPdfPages(doc, source.bytes);
      else pages += await appendImagePage(doc, source.bytes, kind);
    } catch {
      skipped.push(source.name);
    }
  }

  if (pages === 0) {
    throw new Error("No certificate pages could be built from the uploaded files.");
  }

  return {
    bytes: Buffer.from(await doc.save()),
    pages,
    included: sources.length - skipped.length,
    skipped,
  };
}
