import {
  DOC_MIME,
  DOCX_MIME,
  detectKindFromBytes,
  type DetectKindFromBytesOptions,
} from "@/lib/document-bytes";

export type CertificateContentKind = "pdf" | "doc" | "docx" | "png" | "jpg" | "webp";
export type StoredCertificateKind = Exclude<CertificateContentKind, "webp">;

/** Drop a trailing dot so "certs." and "ticket.pdf." are classified on the real name. */
export function normalizedCertificateName(name: string) {
  const trimmed = name.trim().replace(/\.+$/g, "");
  return trimmed || "upload";
}

/** Extension after ignoring trailing dots. "certs." and "certs" have none. */
export function bareCertificateExtension(name: string): string | null {
  const base = normalizedCertificateName(name).split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext)) return null;
  return ext;
}

export function extensionIsMissing(name: string) {
  return bareCertificateExtension(name) === null;
}

export function unsupportedCertificateTypeMessage(
  fileName: string,
  options?: { missingExtension?: boolean },
) {
  const name = fileName.trim() || "This file";
  const quoted = `"${name}"`;
  if (options?.missingExtension) {
    return `${quoted} has no file extension, and its contents are not a recognisable certificate type. Save it as a PDF, or take photos of the pages (JPG or PNG) and upload those.`;
  }
  return `${quoted} has no recognisable file type. Save it as a PDF, or take photos of the pages (JPG or PNG) and upload those.`;
}

export function certificateKindFromMime(contentType?: string): CertificateContentKind | null {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    !type ||
    type === "application/octet-stream" ||
    type === "binary/octet-stream" ||
    type === "application/x-download"
  ) {
    return null;
  }
  if (type === "application/pdf" || type === "application/x-pdf") return "pdf";
  if (type === DOCX_MIME) return "docx";
  if (type === DOC_MIME) return "doc";
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/pjpeg") return "jpg";
  if (type === "image/webp") return "webp";
  return null;
}

function isPng(bytes: Uint8Array | Buffer) {
  if (bytes.length < 4) return false;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return false;
  if (bytes.length < 8) return true;
  return bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function isJpeg(bytes: Uint8Array | Buffer) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array | Buffer) {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/** Sniff a certificate when the name has no extension. Signatures are at the start of the file. */
export function detectCertificateKindFromBytes(
  bytes: Uint8Array | Buffer,
  options?: DetectKindFromBytesOptions,
): CertificateContentKind | null {
  if (isPng(bytes)) return "png";
  if (isJpeg(bytes)) return "jpg";
  if (isWebp(bytes)) return "webp";
  return detectKindFromBytes(bytes, options);
}

export function certificateExtension(kind: StoredCertificateKind) {
  return kind === "jpg" ? "jpg" : kind;
}

export function mimeForCertificateKind(kind: CertificateContentKind) {
  if (kind === "pdf") return "application/pdf";
  if (kind === "docx") return DOCX_MIME;
  if (kind === "doc") return DOC_MIME;
  if (kind === "png") return "image/png";
  if (kind === "webp") return "image/webp";
  return "image/jpeg";
}

export function fileNameForCertificateKind(name: string, kind: StoredCertificateKind) {
  const ext = certificateExtension(kind);
  const base = normalizedCertificateName(name);
  const current = bareCertificateExtension(base);
  if (current === ext) return base;
  if (kind === "jpg" && current === "jpeg") return base.replace(/\.jpeg$/i, ".jpg");
  if (!current) return `${base}.${ext}`;
  return base;
}

export type ResolvedCertificateFile = {
  ok: true;
  kind: StoredCertificateKind;
  fileName: string;
  contentType: string;
};

/**
 * Name has no usable extension (missing, or only a trailing dot).
 * Prefer magic bytes when present; otherwise a specific browser MIME.
 * application/octet-stream is not a type.
 */
export function resolveMissingExtensionCertificate(input: {
  name: string;
  contentType?: string;
  bytes?: Uint8Array | Buffer | null;
  sniffDocxFromZipHead?: boolean;
}): ResolvedCertificateFile | { ok: false; error: string } {
  const sawBytes = Boolean(input.bytes && input.bytes.length > 0);
  const byteKind = sawBytes
    ? detectCertificateKindFromBytes(input.bytes as Uint8Array | Buffer, {
        sniffDocxFromZipHead: input.sniffDocxFromZipHead,
      })
    : null;
  const mimeKind = certificateKindFromMime(input.contentType);
  const kind = sawBytes ? byteKind : mimeKind;
  if (!kind || kind === "webp") {
    return {
      ok: false,
      error: unsupportedCertificateTypeMessage(input.name, { missingExtension: true }),
    };
  }
  return {
    ok: true,
    kind,
    fileName: fileNameForCertificateKind(input.name, kind),
    contentType: mimeForCertificateKind(kind),
  };
}
