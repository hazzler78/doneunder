import type { SupabaseClient } from "@supabase/supabase-js";
import {
  downloadDiverDocumentBytes,
  mainCvStoragePath,
  mimeForCvUpload,
  removeDiverDocumentPaths,
  validateCvBytes,
} from "@/lib/diver-storage-upload";
import { DIVER_DOCUMENTS_BUCKET } from "@/lib/diver-documents";
import { looksLikeMainCvFilename } from "@/lib/document-names";

export function certificatePanelCvMisrouteLooksLike(fileName: string, hasStoredCv: boolean) {
  return hasStoredCv && looksLikeMainCvFilename(fileName);
}

export function buildCertificatePanelCvMisrouteMessage(fileName: string) {
  return (
    `I saved **${fileName}**, but the filename looks like a **CV**, not a certificate — I did not read tickets from it.\n\n` +
    `To update your living CV, use **Seed CV** / **Replace living CV** in the workspace certificate panel, not the certificate file upload.\n\n` +
    `Your stored CV and certifications are unchanged.`
  );
}

/** Inline note for the certificate batch assistant reply (no markdown). */
export function certificatePanelCvMisrouteNote(fileName: string) {
  return `${fileName} looks like a CV, not a certificate — use Seed CV / Replace living CV to update your profile; this upload did not change your living CV.`;
}

export async function storeMainCvFromBytes(
  supabase: SupabaseClient,
  diverId: string,
  input: { fileName: string; bytes: Buffer; contentType?: string },
): Promise<{ path: string; name: string; fileSize: number }> {
  const cvBytesCheck = validateCvBytes(input.bytes, {
    name: input.fileName,
    contentType: input.contentType,
  });
  if (!cvBytesCheck.ok) {
    throw new Error(cvBytesCheck.error);
  }
  const path = mainCvStoragePath(diverId, input.fileName);
  const upload = await supabase.storage.from(DIVER_DOCUMENTS_BUCKET).upload(path, input.bytes, {
    contentType: mimeForCvUpload(input.fileName, input.contentType),
    upsert: true,
  });
  if (upload.error) {
    throw new Error(upload.error.message);
  }
  return { path, name: input.fileName, fileSize: input.bytes.length };
}

export async function promoteCertificateStagingToMainCv(
  supabase: SupabaseClient,
  diverId: string,
  input: { stagingPath: string; fileName: string; contentType?: string },
): Promise<{ path: string; name: string; fileSize: number }> {
  const bytes = await downloadDiverDocumentBytes(supabase, input.stagingPath);
  const stored = await storeMainCvFromBytes(supabase, diverId, {
    fileName: input.fileName,
    bytes,
    contentType: input.contentType,
  });
  await removeDiverDocumentPaths(supabase, [input.stagingPath]);
  return stored;
}