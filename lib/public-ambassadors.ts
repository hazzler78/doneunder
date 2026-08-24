import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/feature-flags";
import { isIndexableAmbassadorUsername } from "@/lib/usernames";

export type PublicAmbassadorCard = {
  username: string;
  fullName: string;
  headline: string;
  location: string;
  availabilityStatus: string;
  mobilizationNotice: string;
};

export async function loadPublicAmbassadorCards(limit = 4): Promise<PublicAmbassadorCard[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("public_diver_ambassador")
      .select(
        "username,full_name,headline,ambassador_public_headline,location,availability_status,mobilization_notice",
      )
      .not("username", "is", null)
      .order("published_at", { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return data
      .filter((row) => isIndexableAmbassadorUsername(row.username))
      .slice(0, limit)
      .map((row) => ({
        username: row.username as string,
        fullName: row.full_name || (row.username as string),
        headline: row.ambassador_public_headline || row.headline || "Commercial diver",
        location: row.location || "",
        availabilityStatus: row.availability_status || "available",
        mobilizationNotice: row.mobilization_notice || "",
      }));
  } catch (error) {
    console.error("Failed to load public ambassadors:", error);
    return [];
  }
}
