import type { MetadataRoute } from "next";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

const STATIC_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/jobs", changeFrequency: "daily", priority: 0.9 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((entry) => ({
    url: `${SITE_URL}${entry.path}`,
    lastModified: new Date(),
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));

  let profileEntries: MetadataRoute.Sitemap = [];
  try {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase
      .from("public_diver_ambassador")
      .select("username,published_at")
      .not("username", "is", null)
      .order("published_at", { ascending: false });

    profileEntries = (data ?? [])
      .filter((row) => row.username?.trim())
      .map((row) => ({
        url: `${SITE_URL}/${row.username}`,
        lastModified: row.published_at ? new Date(row.published_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch (error) {
    console.error("Sitemap profile fetch failed:", error);
  }

  return [...staticEntries, ...profileEntries];
}
