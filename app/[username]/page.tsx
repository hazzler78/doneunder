import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AmbassadorProfileSwipe } from "@/components/ambassador-profile-swipe";
import { AmbassadorProfileView } from "@/components/ambassador-profile-view";
import { loadAmbassadorSwipeContext } from "@/lib/public-ambassadors";
import { SITE_URL } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isIndexableAmbassadorUsername } from "@/lib/usernames";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: rawUsername } = await params;
  const username = rawUsername.trim().toLowerCase();
  if (!isIndexableAmbassadorUsername(username)) {
    return { title: "Profile", robots: { index: false, follow: false } };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("public_diver_ambassador")
    .select("user_id, full_name, ambassador_public_headline, headline")
    .eq("username", username)
    .maybeSingle();

  let image: string | undefined;
  if (data?.user_id) {
    const { data: userRow } = await supabase
      .from("users")
      .select("avatar_url")
      .eq("id", data.user_id)
      .maybeSingle();
    image = userRow?.avatar_url?.split("?")[0] || undefined;
  }

  const name = data?.full_name || username;
  const description =
    data?.ambassador_public_headline ||
    data?.headline ||
    `Commercial diver profile on doneunder.ai`;

  return {
    title: `${name} | doneunder.ai`,
    description,
    openGraph: {
      title: name,
      description,
      url: `${SITE_URL}/${username}`,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function AmbassadorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: rawUsername } = await params;
  const username = rawUsername.trim().toLowerCase();
  const supabase = await createSupabaseServerClient();
  const { data: publicAmbassador } = await supabase
    .from("public_diver_ambassador")
    .select(
      "user_id,username,full_name,headline,bio,sat_hours,dive_hours,location,mobilization_notice,availability_status,polished_cv_markdown,ambassador_public_headline,ambassador_short_bio,ambassador_key_highlights",
    )
    .eq("username", username)
    .maybeSingle();

  if (!publicAmbassador) notFound();

  const [{ data: certifications }, { data: userRow }, swipe] = await Promise.all([
    supabase
      .from("diver_certifications")
      .select("name,expiry_date")
      .eq("diver_id", publicAmbassador.user_id)
      .order("sort_order", { ascending: true }),
    supabase.from("users").select("avatar_url").eq("id", publicAmbassador.user_id).maybeSingle(),
    loadAmbassadorSwipeContext(username),
  ]);

  const avatarUrl = userRow?.avatar_url ?? null;

  const displayName = publicAmbassador.full_name || "Commercial Diver";
  const certRows = (certifications ?? []).map((cert) => ({
    name: cert.name,
    expiry_date: cert.expiry_date,
  }));
  const highlights = Array.isArray(publicAmbassador.ambassador_key_highlights)
    ? publicAmbassador.ambassador_key_highlights.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  const profile = (
    <AmbassadorProfileView
      displayName={displayName}
      username={username}
      headline={publicAmbassador.ambassador_public_headline || publicAmbassador.headline || null}
      shortBio={publicAmbassador.ambassador_short_bio || publicAmbassador.bio || null}
      highlights={highlights}
      satHours={publicAmbassador.sat_hours ?? 0}
      diveHours={publicAmbassador.dive_hours ?? 0}
      location={publicAmbassador.location || null}
      mobilizationNotice={publicAmbassador.mobilization_notice || null}
      availabilityStatus={
        publicAmbassador.availability_status === "deployed" ? "deployed" : "available"
      }
      certifications={certRows}
      avatarUrl={avatarUrl}
      showCvLink={Boolean(publicAmbassador.polished_cv_markdown || username === "gareth")}
    />
  );

  if (!swipe) return profile;

  return <AmbassadorProfileSwipe swipe={swipe}>{profile}</AmbassadorProfileSwipe>;
}
