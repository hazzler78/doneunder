export const DOC_MIME = "application/msword";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DocumentFileKind = "pdf" | "doc" | "docx";

const WORD_EXT = /\.(docx?)$/i;
const PDF_EXT = /\.pdf$/i;

const WORD_MIME =
  /^(application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;

export const SUPPORTED_CERTIFICATE_FORMATS_MESSAGE =
  "Use PDF, Word (.doc, .docx), JPG, or PNG.";

export const SUPPORTED_CV_FORMATS_MESSAGE =
  "Upload your CV as PDF or Word (.doc, .docx).";

export const LEGACY_DOC_NO_TEXT_MESSAGE =
  "We saved your .doc file, but we could not extract readable text for automatic profile filling. " +
  "Save the CV as .docx or PDF and upload again, or paste your CV text in chat.";

export function extensionKindFromName(name: string): DocumentFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}

export function isWordFileMeta(file: { name: string; type?: string }) {
  const name = file.name.toLowerCase();
  if (WORD_EXT.test(name)) return true;
  const type = file.type?.trim() ?? "";
  return type ? WORD_MIME.test(type) : false;
}

export function classifyDocumentFile(name: string, contentType?: string): DocumentFileKind | null {
  const fromName = extensionKindFromName(name);
  const type = (contentType ?? "").toLowerCase();
  if (type === "application/pdf" || PDF_EXT.test(name.toLowerCase())) return "pdf";
  if (type === DOCX_MIME || name.toLowerCase().endsWith(".docx")) return "docx";
  if (type === DOC_MIME || name.toLowerCase().endsWith(".doc")) return "doc";
  return fromName;
}

type ByteInput = Buffer | Uint8Array;

function includesAscii(bytes: ByteInput, needle: string) {
  const pattern = new TextEncoder().encode(needle);
  for (let i = 0; i <= bytes.length - pattern.length; i += 1) {
    let match = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

export function isOleCompoundFile(bytes: ByteInput) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

export function isZipArchive(bytes: ByteInput) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function isPdfBytes(bytes: ByteInput) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

export function looksLikeDocxPackage(bytes: ByteInput) {
  if (!isZipArchive(bytes)) return false;
  return includesAscii(bytes, "word/document.xml");
}

export function detectKindFromBytes(bytes: ByteInput): DocumentFileKind | null {
  if (isPdfBytes(bytes)) return "pdf";
  if (looksLikeDocxPackage(bytes)) return "docx";
  if (isOleCompoundFile(bytes)) return "doc";
  return null;
}

export function unsupportedDocumentMessage(fileName: string, context: "cv" | "certificate") {
  const allowed =
    context === "cv"
      ? "PDF, Word (.doc, .docx)"
      : "PDF, Word (.doc, .docx), JPG, PNG";
  return `Unsupported file type for ${fileName}. Allowed: ${allowed}.`;
}

export function validateDocumentBytes(
  bytes: Buffer,
  fileName: string,
  contentType?: string,
  context: "cv" | "certificate" = "cv",
): { ok: true; kind: DocumentFileKind } | { ok: false; error: string } {
  if (bytes.length === 0) {
    return { ok: false, error: `${fileName} is empty.` };
  }
  const declared = classifyDocumentFile(fileName, contentType);
  const detected = detectKindFromBytes(bytes);
  if (!detected) {
    return { ok: false, error: unsupportedDocumentMessage(fileName, context) };
  }
  if (declared && declared !== detected) {
    return {
      ok: false,
      error: `${fileName} does not match its contents (expected ${declared}, found ${detected}).`,
    };
  }
  return { ok: true, kind: detected };
}

export function mainCvStorageBasename(fileName: string) {
  const kind = extensionKindFromName(fileName) ?? "pdf";
  if (kind === "docx") return "original-cv.docx";
  if (kind === "doc") return "original-cv.doc";
  return "original-cv.pdf";
}

export function mimeForDocumentKind(kind: DocumentFileKind) {
  if (kind === "pdf") return "application/pdf";
  if (kind === "docx") return DOCX_MIME;
  return DOC_MIME;
}
