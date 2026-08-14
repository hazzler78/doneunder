import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCertificatePackPdf, classifyCertificateFile } from "@/lib/certificate-pack";
import type { EmailAttachment } from "@/lib/email";
import { buildDiverCertificatesPdf, certificatesPdfFilename } from "@/lib/cv-pdf";
import type { DiverProfileFull } from "@/lib/diver-profile";

export const DIVER_DOCUMENTS_BUCKET = "diver-documents";
const BUCKET = DIVER_DOCUMENTS_BUCKET;
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 35 * 1024 * 1024;
const MAX_PACK_BYTES = 32 * 1024 * 1024;

export type DiverDocumentFile = {
  name: string;
  path: string;
  created_at: string;
  size: number;
};

function isMainCvFilename(name: string) {
  return /^main-cv-/i.test(name);
}

function contentTypeForName(name: string) {
  const kind = classifyCertificateFile(name);
  if (kind === "pdf") return "application/pdf";
  if (kind === "png") return "image/png";
  if (kind === "jpg") return "image/jpeg";
  if (kind === "webp") return "image/webp";
  return "";
}

function isAttachableCertificate(name: string) {
  return Boolean(contentTypeForName(name)) && !isMainCvFilename(name);
}

function attachmentFilename(displayName: string, originalName: string, index: number) {
  const slug = displayName
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Diver";
  const extMatch = originalName.toLowerCase().match(/\.(pdf|png|jpe?g|webp)$/);
  const ext = extMatch?.[1] === "jpeg" ? "jpg" : (extMatch?.[1] ?? "pdf");
  if (/^cert-/i.test(originalName) || originalName.length > 48) {
    return `${slug}-certificate-${index + 1}.${ext}`;
  }
  return originalName;
}

export async function listDiverDocumentFiles(
  supabase: SupabaseClient,
  diverId: string,
): Promise<DiverDocumentFile[]> {
  const { data: batchFolders, error } = await supabase.storage.from(BUCKET).list(diverId, {
    sortBy: { column: "created_at", order: "desc" },
    limit: 100,
  });
  if (error) throw new Error(error.message);

  const folderNames = (batchFolders ?? []).map((item) => item.name).filter(Boolean);
  const nested = await Promise.all(
    folderNames.map(async (folder) => {
      const { data: files } = await supabase.storage.from(BUCKET).list(`${diverId}/${folder}`, {
        sortBy: { column: "created_at", order: "desc" },
        limit: 100,
      });
      return (files ?? []).map((file) => ({
        name: file.name,
        path: `${diverId}/${folder}/${file.name}`,
        created_at: file.created_at ?? new Date().toISOString(),
        size: file.metadata?.size ?? 0,
      }));
    }),
  );

  return nested.flat().sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
}

export async function uploadDiverCertificateFiles(
  supabase: SupabaseClient,
  diverId: string,
  files: Array<{ name: string; bytes: Buffer; contentType: string }>,
) {
  const importBatchId = randomUUID();
  const uploaded: { path: string; name: string; mimeType: string }[] = [];
  for (const file of files) {
    const kind = classifyCertificateFile(file.name, file.contentType);
    if (!kind) throw new Error(`Unsupported certificate format for ${file.name}. Use PDF, JPG, or PNG.`);
    const extension = kind === "pdf" ? "pdf" : kind === "png" ? "png" : "jpg";
    const path = `${diverId}/${importBatchId}/cert-${randomUUID()}.${extension}`;
    const mime =
      kind === "pdf" ? "application/pdf" : kind === "png" ? "image/png" : "image/jpeg";
    const result = await supabase.storage.from(BUCKET).upload(path, file.bytes, {
      contentType: mime,
      upsert: false,
    });
    if (result.error) throw new Error(`Failed to upload ${file.name}: ${result.error.message}`);
    uploaded.push({ path, name: file.name, mimeType: mime });
  }
  return { importBatchId, uploaded };
}

export async function buildCertificateAttachments(
  supabase: SupabaseClient,
  input: {
    diverId: string;
    displayName: string;
    profile: DiverProfileFull;
  },
): Promise<EmailAttachment[]> {
  const files = (await listDiverDocumentFiles(supabase, input.diverId)).filter((file) =>
    isAttachableCertificate(file.name),
  );

  const sources: Array<{ name: string; bytes: Buffer; contentType: string }> = [];
  let total = 0;
  for (const file of files.slice(0, MAX_FILES)) {
    if (file.size > MAX_FILE_BYTES) continue;
    const { data, error } = await supabase.storage.from(BUCKET).download(file.path);
    if (error || !data) continue;
    const content = Buffer.from(await data.arrayBuffer());
    if (content.length === 0 || content.length > MAX_FILE_BYTES) continue;
    if (total + content.length > MAX_TOTAL_BYTES) break;
    total += content.length;
    sources.push({
      name: file.name,
      bytes: content,
      contentType: contentTypeForName(file.name) || "application/octet-stream",
    });
  }

  if (sources.length > 0) {
    try {
      const pack = await buildCertificatePackPdf(sources);
      if (
        pack.bytes.length >= 100 &&
        pack.bytes.subarray(0, 5).toString("utf8").startsWith("%PDF") &&
        pack.bytes.length <= MAX_PACK_BYTES
      ) {
        return [
          {
            filename: certificatesPdfFilename(input.displayName),
            content: pack.bytes,
            contentType: "application/pdf",
          },
        ];
      }
    } catch {
      // Fall through to individual attachments if the pack cannot be built.
    }

    return sources.map((file, index) => ({
      filename: attachmentFilename(input.displayName, file.name, index),
      content: file.bytes,
      contentType: file.contentType,
    }));
  }

  if (input.profile.certifications.length === 0) return [];

  const generated = buildDiverCertificatesPdf(input.profile, input.displayName);
  if (generated.length < 100 || !generated.subarray(0, 5).toString("utf8").startsWith("%PDF")) {
    return [];
  }
  return [
    {
      filename: certificatesPdfFilename(input.displayName),
      content: generated,
      contentType: "application/pdf",
    },
  ];
}
