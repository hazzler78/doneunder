import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCertificateReads, pdfCopyFromImage, readAllCertificatesFromBytes } from "@/lib/cert-text";
import {
  listCertificateDocumentFiles,
  listDiverDocumentFiles,
  upsertDiverCertificateFile,
} from "@/lib/diver-documents";
import {
  downloadDiverDocumentBytes,
  removeDiverDocumentPaths,
  assertCertificateStagingPath,
  validateCertificateBytes,
} from "@/lib/diver-storage-upload";

export type ProcessedCertificateUpload = {
  name: string;
  action: "added" | "renewed" | "duplicate";
  path: string;
  issue_date: string | null;
  expiry_date: string | null;
  ticket: string | null;
  tickets: Array<{
    name?: string | null;
    issue_date?: string | null;
    expiry_date?: string | null;
    source?: string | null;
  }>;
  ticketCount: number;
  source: string;
};

export async function processCertificateFromBytes(
  supabase: SupabaseClient,
  diverId: string,
  input: { name: string; bytes: Buffer; contentType: string },
  existing?: Awaited<ReturnType<typeof listDiverDocumentFiles>>,
): Promise<ProcessedCertificateUpload> {
  const fileList = existing ?? listCertificateDocumentFiles(await listDiverDocumentFiles(supabase, diverId));
  const result = await upsertDiverCertificateFile(
    supabase,
    diverId,
    { name: input.name, bytes: input.bytes, contentType: input.contentType || "" },
    fileList,
  );
  fileList.push({
    name: result.name,
    path: result.path,
    created_at: new Date().toISOString(),
    size: input.bytes.length,
  });
  const reads = await readAllCertificatesFromBytes(input.bytes, input.name, input.contentType);
  if (reads.length > 0) {
    await applyCertificateReads(supabase, diverId, reads, input.name, result.path);
  }
  const pdfCopy = await pdfCopyFromImage(input.bytes, input.name, input.contentType);
  if (pdfCopy) {
    await upsertDiverCertificateFile(
      supabase,
      diverId,
      {
        name: input.name.replace(/\.[a-z0-9]+$/i, ".pdf"),
        bytes: pdfCopy,
        contentType: "application/pdf",
      },
      fileList,
    );
  }
  const primary = reads[0];
  return {
    name: input.name,
    action: result.action,
    path: result.path,
    issue_date: primary?.issue_date ?? null,
    expiry_date: primary?.expiry_date ?? null,
    ticket: primary?.name ?? null,
    tickets: reads.map((read) => ({
      name: read.name,
      issue_date: read.issue_date,
      expiry_date: read.expiry_date,
      source: read.source,
    })),
    ticketCount: reads.length,
    source: primary?.source ?? "none",
  };
}

export async function processCertificateFromStagingPath(
  supabase: SupabaseClient,
  diverId: string,
  input: { storagePath: string; name: string; contentType?: string },
) {
  const path = assertCertificateStagingPath(diverId, input.storagePath);
  const bytes = await downloadDiverDocumentBytes(supabase, path);
  const byteCheck = validateCertificateBytes(bytes, {
    name: input.name,
    contentType: input.contentType,
  });
  if (!byteCheck.ok) {
    throw new Error(byteCheck.error);
  }
  const processed = await processCertificateFromBytes(supabase, diverId, {
    name: input.name,
    bytes,
    contentType: input.contentType ?? "",
  });
  await removeDiverDocumentPaths(supabase, [path]);
  return processed;
}
