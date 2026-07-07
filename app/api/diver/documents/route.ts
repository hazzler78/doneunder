import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";

const BUCKET = "diver-documents";

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const supabase = createServiceSupabaseClient();
    const { data: batchFolders, error } = await supabase.storage.from(BUCKET).list(authResult.diverId, {
      sortBy: { column: "created_at", order: "desc" },
      limit: 100,
    });
    if (error) {
      return NextResponse.json({ error: "Unable to list diver documents." }, { status: 500 });
    }

    const folderNames = (batchFolders ?? []).map((item) => item.name).filter(Boolean);
    const nested = await Promise.all(
      folderNames.map(async (folder) => {
        const { data: files } = await supabase.storage.from(BUCKET).list(`${authResult.diverId}/${folder}`, {
          sortBy: { column: "created_at", order: "desc" },
          limit: 100,
        });
        return (files ?? []).map((file) => ({
          name: file.name,
          path: `${authResult.diverId}/${folder}/${file.name}`,
          created_at: file.created_at ?? new Date().toISOString(),
          size: file.metadata?.size ?? 0,
        }));
      }),
    );

    const documents = nested.flat().sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

    return NextResponse.json({ documents });
  } catch {
    return NextResponse.json({ error: "Unable to list diver documents." }, { status: 500 });
  }
}
