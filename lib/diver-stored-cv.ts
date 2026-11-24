import type { SupabaseClient } from "@supabase/supabase-js";
import { listDiverDocumentFiles } from "@/lib/diver-documents";
import { isStoredMainCvFilename } from "@/lib/document-names";

/** Whether the diver already has a living CV or a main CV file in storage. */
export async function diverHasStoredCv(supabase: SupabaseClient, diverId: string): Promise<boolean> {
  const [files, profileResult] = await Promise.all([
    listDiverDocumentFiles(supabase, diverId),
    supabase
      .from("diver_profiles")
      .select("headline, cv_last_processed_at")
      .eq("user_id", diverId)
      .maybeSingle(),
  ]);
  const headline = (profileResult.data?.headline ?? "").trim();
  const livingPresent =
    headline.length > 0 || Boolean(profileResult.data?.cv_last_processed_at);
  const hasMainCvFile = files.some(
    (file) => file.path.includes("/source/") || isStoredMainCvFilename(file.name),
  );
  return livingPresent || hasMainCvFile;
}