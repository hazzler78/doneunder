import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { listCertificateDocumentFiles, listDiverDocumentFiles } from "@/lib/diver-documents";
import { displayCertificateName } from "@/lib/document-names";

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const supabase = createServiceSupabaseClient();
    const [allFiles, profileResult] = await Promise.all([
      listDiverDocumentFiles(supabase, authResult.diverId),
      supabase
        .from("diver_profiles")
        .select("headline, updated_at")
        .eq("user_id", authResult.diverId)
        .maybeSingle(),
    ]);

    const certificates = listCertificateDocumentFiles(allFiles).map((file) => ({
      ...file,
      name: displayCertificateName(file.name),
    }));
    const headline = (profileResult.data?.headline ?? "").trim();
    const livingCv = {
      present: headline.length > 0,
      updatedAt: profileResult.data?.updated_at ?? null,
    };

    return NextResponse.json({
      livingCv,
      certificates,
      documents: certificates,
    });
  } catch {
    return NextResponse.json({ error: "Unable to list diver documents." }, { status: 500 });
  }
}
