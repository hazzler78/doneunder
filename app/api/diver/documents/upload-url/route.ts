import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import {
  certificateStagingPath,
  createDiverDocumentSignedUploadUrl,
  mainCvStoragePath,
  mimeForCertificateUpload,
  mimeForCvUpload,
  newUploadId,
  validateCertificateUploadMeta,
  validateCvUploadMeta,
  type DiverUploadKind,
} from "@/lib/diver-storage-upload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = (await req.json()) as {
      kind?: DiverUploadKind;
      fileName?: string;
      fileSize?: number;
      contentType?: string;
    };
    const kind = body.kind;
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;
    const contentType = typeof body.contentType === "string" ? body.contentType : "";

    if (!kind || !fileName) {
      return NextResponse.json({ error: "Missing upload kind or file name." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const diverId = authResult.diverId;

    if (kind === "certificate") {
      const validation = validateCertificateUploadMeta({ name: fileName, size: fileSize, contentType });
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const uploadId = newUploadId();
      const path = certificateStagingPath(diverId, uploadId, fileName);
      const mime = mimeForCertificateUpload(fileName, contentType);
      const signed = await createDiverDocumentSignedUploadUrl(supabase, path, mime);
      return NextResponse.json({
        ok: true,
        kind,
        path: signed.path,
        signedUrl: signed.signedUrl,
        token: signed.token,
        contentType: mime,
        uploadId,
      });
    }

    if (kind === "cv") {
      const validation = validateCvUploadMeta({ name: fileName, size: fileSize, contentType });
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const path = mainCvStoragePath(diverId, fileName);
      const mime = mimeForCvUpload(fileName, contentType);
      const signed = await createDiverDocumentSignedUploadUrl(supabase, path, mime);
      return NextResponse.json({
        ok: true,
        kind,
        path: signed.path,
        signedUrl: signed.signedUrl,
        token: signed.token,
        contentType: mime,
      });
    }

    return NextResponse.json({ error: "Unknown upload kind." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to prepare upload.", detail: String(error) },
      { status: 500 },
    );
  }
}
