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
  avatarUrl: string | null;
};

export async function loadPublicAmbassadorCards(limit = 4): Promise<PublicAmbassadorCard[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("public_diver_ambassador")
      .select(
        "user_id,username,full_name,headline,ambassador_public_headline,location,availability_status,mobilization_notice",
      )
      .not("username", "is", null)
      .order("published_at", { ascending: false })
      .limit(20);
    if (error || !data) return [];

    const filtered = data.filter((row) => isIndexableAmbassadorUsername(row.username)).slice(0, limit);
    const userIds = filtered.map((row) => row.user_id).filter(Boolean) as string[];
    const avatarByUserId = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: users } = await supabase.from("users").select("id,avatar_url").in("id", userIds);
      for (const user of users ?? []) {
        avatarByUserId.set(user.id, user.avatar_url ?? null);
      }
    }

    return filtered.map((row) => ({
      username: row.username as string,
      fullName: row.full_name || (row.username as string),
      headline: row.ambassador_public_headline || row.headline || "Commercial diver",
      location: row.location || "",
      availabilityStatus: row.availability_status || "available",
      mobilizationNotice: row.mobilization_notice || "",
      avatarUrl: avatarByUserId.get(row.user_id as string) ?? null,
    }));
  } catch (error) {
    console.error("Failed to load public ambassadors:", error);
    return [];
  }
}
