import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { logDiverUploadFailure } from "@/lib/upload-failure-log";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = (await req.json()) as {
      fileName?: string;
      fileSize?: number;
      error?: string;
      source?: string;
    };
    const fileName = typeof body.fileName === "string" ? body.fileName : "unknown";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;
    const error = typeof body.error === "string" ? body.error : "Upload failed";
    const source = typeof body.source === "string" ? body.source : "browser";

    const supabase = createServiceSupabaseClient();
    await logDiverUploadFailure(supabase, authResult.diverId, {
      fileName,
      fileSize,
      error,
      source,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
