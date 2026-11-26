import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyCertificateFile } from "@/lib/certificate-pack";
import {
  extensionIsMissing,
  mimeForCertificateKind,
  normalizedCertificateName,
  resolveMissingExtensionCertificate,
  unsupportedCertificateTypeMessage,
} from "@/lib/certificate-file-type";
import { isAcceptedMainCvFile } from "@/lib/cv-upload";
import {
  classifyDocumentFile,
  mainCvStorageBasename,
  mimeForDocumentKind,
  SUPPORTED_CV_FORMATS_MESSAGE,
  unsupportedDocumentMessage,
  validateDocumentBytes,
} from "@/lib/document-bytes";
import { DIVER_DOCUMENTS_BUCKET } from "@/lib/diver-documents";
import {
  isOversizeCertificate,
  isOversizeCv,
  oversizeMessage,
} from "@/lib/diver-upload-constants";

export {
  CERT_ACCEPT,
  CERT_MAX_BYTES,
  CV_ACCEPT,
  CV_MAX_BYTES,
  isOversizeCertificate,
  isOversizeCv,
  oversizeMessage,
} from "@/lib/diver-upload-constants";

export type DiverUploadKind = "certificate" | "cv";

export function validateCertificateUploadMeta(input: {
  name: string;
  size: number;
  contentType?: string;
}) {
  if (input.size <= 0) {
    return { ok: false as const, error: `${input.name} is empty.` };
  }
  if (isOversizeCertificate(input.size)) {
    return { ok: false as const, error: oversizeMessage(input.name, 10) };
  }
  if (extensionIsMissing(input.name)) {
    const resolved = resolveMissingExtensionCertificate({
      name: input.name,
      contentType: input.contentType,
    });
    if (!resolved.ok) return resolved;
    return {
      ok: true as const,
      kind: resolved.kind,
      fileName: resolved.fileName,
      contentType: resolved.contentType,
    };
  }
  const name = normalizedCertificateName(input.name);
  const classified = classifyCertificateFile(name, input.contentType);
  if (!classified || classified === "webp") {
    return { ok: false as const, error: unsupportedCertificateTypeMessage(input.name) };
  }
  return {
    ok: true as const,
    kind: classified,
    fileName: name,
    contentType: mimeForCertificateKind(classified),
  };
}

export function validateCvUploadMeta(input: { name: string; size: number; contentType?: string }) {
  if (input.size <= 0) {
    return { ok: false as const, error: `${input.name} is empty.` };
  }
  if (!isAcceptedMainCvFile(input)) {
    return {
      ok: false as const,
      error: unsupportedDocumentMessage(input.name, "cv"),
      code: "unsupported" as const,
    };
  }
  if (isOversizeCv(input.size)) {
    return { ok: false as const, error: oversizeMessage(input.name, 12) };
  }
  const kind = classifyDocumentFile(input.name, input.contentType);
  if (!kind) {
    return {
      ok: false as const,
      error: unsupportedDocumentMessage(input.name, "cv"),
      code: "unsupported" as const,
    };
  }
  return { ok: true as const, kind };
}

export function validateCertificateBytes(bytes: Buffer, input: { name: string; contentType?: string }) {
  if (bytes.length === 0) {
    return { ok: false as const, error: `${input.name} is empty.` };
  }
  if (extensionIsMissing(input.name)) {
    if (isOversizeCertificate(bytes.length)) {
      return { ok: false as const, error: oversizeMessage(input.name, 10) };
    }
    const resolved = resolveMissingExtensionCertificate({
      name: input.name,
      contentType: input.contentType,
      bytes,
    });
    if (!resolved.ok) return resolved;
    if (resolved.kind === "pdf" || resolved.kind === "doc" || resolved.kind === "docx") {
      const docCheck = validateDocumentBytes(bytes, resolved.fileName, resolved.contentType, "certificate");
      if (!docCheck.ok) return docCheck;
    }
    return {
      ok: true as const,
      kind: resolved.kind,
      fileName: resolved.fileName,
      contentType: resolved.contentType,
    };
  }
  const meta = validateCertificateUploadMeta({
    name: input.name,
    size: bytes.length,
    contentType: input.contentType,
  });
  if (!meta.ok) return meta;
  if (meta.kind === "pdf" || meta.kind === "doc" || meta.kind === "docx") {
    const docCheck = validateDocumentBytes(bytes, meta.fileName, meta.contentType, "certificate");
    if (!docCheck.ok) return docCheck;
  }
  return {
    ok: true as const,
    kind: meta.kind,
    fileName: meta.fileName,
    contentType: meta.contentType,
  };
}

export function validateCvBytes(bytes: Buffer, input: { name: string; contentType?: string }) {
  const meta = validateCvUploadMeta({
    name: input.name,
    size: bytes.length,
    contentType: input.contentType,
  });
  if (!meta.ok) return meta;
  return validateDocumentBytes(bytes, input.name, input.contentType, "cv");
}

function sanitizeFileName(name: string) {
  const base = name.replace(/[/\\]+/g, "_").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return (base || "upload").slice(0, 160);
}

export function certificateStagingPath(diverId: string, uploadId: string, fileName: string) {
  return `${diverId}/certs/_upload/${uploadId}/${sanitizeFileName(fileName)}`;
}

export function mainCvStoragePath(diverId: string, fileName?: string) {
  const base = fileName ? mainCvStorageBasename(fileName) : "original-cv.pdf";
  return `${diverId}/source/${base}`;
}

export function newUploadId() {
  return randomUUID();
}

/** Ensures a storage path belongs to this diver and is not path-traversal. */
export function assertDiverOwnsStoragePath(diverId: string, path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith(`${diverId}/`)) {
    throw new Error("Invalid storage path.");
  }
  if (normalized.includes("..")) {
    throw new Error("Invalid storage path.");
  }
  return normalized;
}

export function assertCertificateStagingPath(diverId: string, path: string) {
  const normalized = assertDiverOwnsStoragePath(diverId, path);
  if (!normalized.includes("/certs/_upload/")) {
    throw new Error("Certificate staging path required.");
  }
  return normalized;
}

export function assertMainCvStoragePath(diverId: string, path: string) {
  const normalized = assertDiverOwnsStoragePath(diverId, path);
  const prefix = `${diverId}/source/original-cv.`;
  if (!normalized.startsWith(prefix)) {
    throw new Error("Invalid CV storage path.");
  }
  const ext = normalized.slice(prefix.length);
  if (!["pdf", "doc", "docx"].includes(ext)) {
    throw new Error("Invalid CV storage path.");
  }
  return normalized;
}

export async function createDiverDocumentSignedUploadUrl(
  supabase: SupabaseClient,
  storagePath: string,
  contentType: string,
) {
  const { data, error } = await supabase.storage
    .from(DIVER_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create upload URL.");
  }
  return {
    signedUrl: data.signedUrl,
    path: storagePath,
    token: data.token,
    contentType,
  };
}

export async function downloadDiverDocumentBytes(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from(DIVER_DOCUMENTS_BUCKET).download(path);
  if (error || !data) {
    throw new Error(error?.message ?? `Could not read uploaded file at ${path}.`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function removeDiverDocumentPaths(supabase: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return;
  await supabase.storage.from(DIVER_DOCUMENTS_BUCKET).remove(paths);
}

export function mimeForCertificateUpload(name: string, contentType?: string) {
  const kind = classifyCertificateFile(name, contentType);
  if (kind === "pdf") return "application/pdf";
  if (kind === "docx") return mimeForDocumentKind("docx");
  if (kind === "doc") return mimeForDocumentKind("doc");
  if (kind === "png") return "image/png";
  if (kind === "jpg") return "image/jpeg";
  return contentType?.trim() || "application/octet-stream";
}

export function mimeForCvUpload(name: string, contentType?: string) {
  const kind = classifyDocumentFile(name, contentType);
  if (!kind) return contentType?.trim() || "application/octet-stream";
  return mimeForDocumentKind(kind);
}

export { SUPPORTED_CV_FORMATS_MESSAGE };
