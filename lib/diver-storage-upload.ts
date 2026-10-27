import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyCertificateFile } from "@/lib/certificate-pack";
import { isAcceptedMainCvFile, isWordCvFile } from "@/lib/cv-upload";
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
  const kind = classifyCertificateFile(input.name, input.contentType);
  if (!kind || kind === "webp") {
    return {
      ok: false as const,
      error: `Unsupported certificate format for ${input.name}. Use PDF, JPG, or PNG.`,
    };
  }
  return { ok: true as const, kind };
}

export function validateCvUploadMeta(input: { name: string; size: number; contentType?: string }) {
  if (input.size <= 0) {
    return { ok: false as const, error: `${input.name} is empty.` };
  }
  if (isWordCvFile(input)) {
    return { ok: false as const, error: "word_cv" as const };
  }
  if (!isAcceptedMainCvFile(input)) {
    return { ok: false as const, error: "not_pdf" as const };
  }
  if (isOversizeCv(input.size)) {
    return { ok: false as const, error: oversizeMessage(input.name, 12) };
  }
  return { ok: true as const };
}

function sanitizeFileName(name: string) {
  const base = name.replace(/[/\\]+/g, "_").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return (base || "upload").slice(0, 160);
}

export function certificateStagingPath(diverId: string, uploadId: string, fileName: string) {
  return `${diverId}/certs/_upload/${uploadId}/${sanitizeFileName(fileName)}`;
}

export function mainCvStoragePath(diverId: string) {
  return `${diverId}/source/original-cv.pdf`;
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
  if (normalized !== mainCvStoragePath(diverId)) {
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
