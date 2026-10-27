import {
  CV_MAX_BYTES,
  isOversizeCertificate,
  isOversizeCv,
  oversizeMessage,
} from "@/lib/diver-upload-constants";

export type CertificateUploadAction = "added" | "renewed" | "duplicate";

export type CertificateUploadItem = {
  name: string;
  action: CertificateUploadAction;
  ticket?: string | null;
  expiry_date?: string | null;
  issue_date?: string | null;
  ticketCount?: number;
  tickets?: Array<{
    name?: string | null;
    issue_date?: string | null;
    expiry_date?: string | null;
    source?: string | null;
  }>;
};

type ApiJson = Record<string, unknown>;

export async function readApiJson(response: Response): Promise<ApiJson> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as ApiJson;
  } catch {
    if (response.status === 413) {
      return { error: "File is too large for the server gateway. Use direct upload or a smaller file." };
    }
    const snippet = text.slice(0, 120).replace(/\s+/g, " ");
    return {
      error: response.ok
        ? "Unexpected response from server."
        : `Upload failed (${response.status})${snippet ? `: ${snippet}` : ""}`,
    };
  }
}

function apiErrorMessage(data: ApiJson, response: Response, fileName: string, maxMb: number) {
  if (response.status === 413) {
    return oversizeMessage(fileName, maxMb);
  }
  const err = typeof data.error === "string" ? data.error : undefined;
  return err ?? `Upload failed (${response.status})`;
}

async function logClientUploadFailure(file: File, error: string) {
  try {
    await fetch("/api/diver/documents/upload-failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileSize: file.size, error }),
    });
  } catch {
    // server-side finalize route logs failures too
  }
}

async function compressImageIfNeeded(file: File): Promise<File> {
  const isImage =
    /^image\/(jpeg|jpg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!isImage || file.size <= 1_200_000) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1800;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    bitmap.close();
    if (!blob || blob.size === 0) return file;
    const name = file.name.replace(/\.[a-z0-9]+$/i, ".jpg");
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function requestSignedUploadUrl(input: {
  kind: "certificate" | "cv";
  file: File;
}) {
  const response = await fetch("/api/diver/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: input.kind,
      fileName: input.file.name,
      fileSize: input.file.size,
      contentType: input.file.type || "",
    }),
  });
  const data = await readApiJson(response);
  if (!response.ok) {
    const maxMb = input.kind === "cv" ? 12 : 10;
    throw new Error(apiErrorMessage(data, response, input.file.name, maxMb));
  }
  const signedUrl = typeof data.signedUrl === "string" ? data.signedUrl : "";
  const path = typeof data.path === "string" ? data.path : "";
  const contentType =
    typeof data.contentType === "string" ? data.contentType : input.file.type || "application/octet-stream";
  if (!signedUrl || !path) {
    throw new Error("Server did not return an upload URL.");
  }
  return { signedUrl, path, contentType };
}

async function putFileToSignedUrl(file: File, signedUrl: string, contentType: string) {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      response.status === 413
        ? oversizeMessage(file.name, file.size > CV_MAX_BYTES ? 12 : 10)
        : `Storage upload failed (${response.status})${text ? `: ${text.slice(0, 80)}` : ""}`,
    );
  }
}

export async function uploadMainCvDirect(file: File) {
  if (isOversizeCv(file.size)) {
    throw new Error(oversizeMessage(file.name, 12));
  }
  const { signedUrl, path, contentType } = await requestSignedUploadUrl({ kind: "cv", file });
  await putFileToSignedUrl(file, signedUrl, contentType);
  return { path, fileName: file.name };
}

export type StagedCertificateUpload = {
  path: string;
  fileName: string;
  contentType: string;
};

export async function stageCertificateFileDirect(file: File): Promise<StagedCertificateUpload> {
  if (isOversizeCertificate(file.size)) {
    throw new Error(oversizeMessage(file.name, 10));
  }
  const prepared = await compressImageIfNeeded(file);
  const { signedUrl, path, contentType } = await requestSignedUploadUrl({
    kind: "certificate",
    file: prepared,
  });
  await putFileToSignedUrl(prepared, signedUrl, contentType);
  return { path, fileName: prepared.name, contentType };
}

async function finalizeCertificateUpload(staged: StagedCertificateUpload, original: File) {
  const response = await fetch("/api/diver/documents/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: staged.path,
      fileName: staged.fileName,
      contentType: staged.contentType,
      fileSize: original.size,
    }),
  });
  const data = await readApiJson(response);
  if (!response.ok) {
    throw new Error(apiErrorMessage(data, response, staged.fileName, 10));
  }
  const uploaded = Array.isArray(data.uploaded) ? data.uploaded : [];
  const first = uploaded[0] as CertificateUploadItem | undefined;
  return first ?? { name: staged.fileName, action: "added" as const };
}

export async function uploadCertificateFilesSequentially(
  files: File[],
  onProgress?: (current: number, total: number, fileName: string) => void,
) {
  const uploaded: CertificateUploadItem[] = [];
  const errors: string[] = [];

  for (const [index, original] of files.entries()) {
    onProgress?.(index + 1, files.length, original.name);
    if (isOversizeCertificate(original.size)) {
      const message = oversizeMessage(original.name, 10);
      errors.push(`${original.name}: ${message}`);
      void logClientUploadFailure(original, message);
      continue;
    }
    try {
      const staged = await stageCertificateFileDirect(original);
      const item = await finalizeCertificateUpload(staged, original);
      uploaded.push(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${original.name}: ${message}`);
      void logClientUploadFailure(original, message);
    }
  }

  if (uploaded.length > 0) {
    const response = await fetch("/api/diver/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complete: true, files: uploaded }),
    });
    if (!response.ok) {
      const data = await readApiJson(response);
      const message = typeof data.error === "string" ? data.error : "Could not complete upload batch.";
      errors.push(message);
    }
  }

  return { uploaded, errors };
}
