import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { processCertificateFromStagingPath } from "@/lib/process-certificate-upload";
import { assertCertificateStagingPath } from "@/lib/diver-storage-upload";
import { logDiverUploadFailure } from "@/lib/upload-failure-log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = (await req.json()) as {
      path?: string;
      fileName?: string;
      contentType?: string;
      fileSize?: number;
    };
    const storagePath = typeof body.path === "string" ? body.path : "";
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;

    if (!storagePath || !fileName) {
      return NextResponse.json({ error: "Missing storage path or file name." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const diverId = authResult.diverId;

    try {
      assertCertificateStagingPath(diverId, storagePath);
    } catch {
      return NextResponse.json({ error: "Invalid certificate upload path." }, { status: 400 });
    }

    try {
      const uploaded = await processCertificateFromStagingPath(supabase, diverId, {
        storagePath,
        name: fileName,
        contentType,
      });
      return NextResponse.json({ ok: true, uploaded: [uploaded] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logDiverUploadFailure(supabase, diverId, {
        fileName,
        fileSize,
        error: message,
        source: "documents-finalize",
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to finalize upload.", detail: String(error) },
      { status: 500 },
    );
  }
}
