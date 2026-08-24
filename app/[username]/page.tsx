import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AmbassadorProfileView } from "@/components/ambassador-profile-view";
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
  return { title: `${username} | doneunder.ai` };
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

  const [{ data: certifications }] = await Promise.all([
    supabase
      .from("diver_certifications")
      .select("name,expiry_date")
      .eq("diver_id", publicAmbassador?.user_id)
      .order("sort_order", { ascending: true }),
  ]);

  const displayName = publicAmbassador.full_name || "Commercial Diver";
  const certRows = (certifications ?? []).map((cert) => ({ name: cert.name, expiry_date: cert.expiry_date }));
  const highlights = Array.isArray(publicAmbassador.ambassador_key_highlights)
    ? publicAmbassador.ambassador_key_highlights.filter((item): item is string => typeof item === "string")
    : [];

  return (
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
      availabilityStatus={publicAmbassador.availability_status === "deployed" ? "deployed" : "available"}
      certifications={certRows}
      showCvLink={Boolean(publicAmbassador.polished_cv_markdown || username === "gareth")}
    />
  );
}
