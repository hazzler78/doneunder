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
        "user_id,username,full_name,headline,ambassador_public_headline,location,availability_status,mobilization_notice,avatar_url",
      )
      .not("username", "is", null)
      .order("published_at", { ascending: false })
      .limit(20);
    if (error || !data) return [];

    const filtered = data.filter((row) => isIndexableAmbassadorUsername(row.username)).slice(0, limit);

    return filtered.map((row) => ({
      username: row.username as string,
      fullName: row.full_name || (row.username as string),
      headline: row.ambassador_public_headline || row.headline || "Commercial diver",
      location: row.location || "",
      availabilityStatus: row.availability_status || "available",
      mobilizationNotice: row.mobilization_notice || "",
      avatarUrl: (row as { avatar_url?: string | null }).avatar_url ?? null,
    }));
  } catch (error) {
    console.error("Failed to load public ambassadors:", error);
    return [];
  }
}

export type AmbassadorNeighbor = {
  username: string;
  fullName: string;
};

export type AmbassadorSwipeContext = {
  index: number;
  total: number;
  previous: AmbassadorNeighbor | null;
  next: AmbassadorNeighbor | null;
};

/** Ordered published ambassadors for swipe / prev-next on profile pages. */
export async function loadAmbassadorSwipeContext(
  currentUsername: string,
): Promise<AmbassadorSwipeContext | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("public_diver_ambassador")
      .select("username,full_name")
      .not("username", "is", null)
      .order("published_at", { ascending: false })
      .limit(40);
    if (error || !data?.length) return null;

    const neighbors = data
      .filter((row) => isIndexableAmbassadorUsername(row.username))
      .map((row) => ({
        username: (row.username as string).trim().toLowerCase(),
        fullName: (row.full_name as string) || (row.username as string),
      }));

    const current = currentUsername.trim().toLowerCase();
    const index = neighbors.findIndex((row) => row.username === current);
    if (index < 0 || neighbors.length < 2) return null;

    return {
      index,
      total: neighbors.length,
      previous: index > 0 ? neighbors[index - 1] : null,
      next: index < neighbors.length - 1 ? neighbors[index + 1] : null,
    };
  } catch (error) {
    console.error("Failed to load ambassador swipe context:", error);
    return null;
  }
}
