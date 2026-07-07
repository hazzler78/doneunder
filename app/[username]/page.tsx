import { notFound } from "next/navigation";
import { AmbassadorProfileView } from "@/components/ambassador-profile-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { divers } from "@/lib/mock-data";

export default async function AmbassadorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: publicAmbassador } = await supabase
    .from("public_diver_ambassador")
    .select(
      "user_id,username,full_name,headline,bio,sat_hours,dive_hours,location,mobilization_notice,availability_status,polished_cv_markdown,ambassador_public_headline,ambassador_short_bio,ambassador_key_highlights",
    )
    .eq("username", username)
    .maybeSingle();
  const fallbackDiver = divers.find((entry) => entry.username === username);
  if (!publicAmbassador && !fallbackDiver) notFound();

  const [{ data: certifications }] = await Promise.all([
    supabase
      .from("diver_certifications")
      .select("name,expiry_date")
      .eq("diver_id", publicAmbassador?.user_id)
      .order("sort_order", { ascending: true }),
  ]);

  const safeProfile = publicAmbassador ?? null;
  const displayName = publicAmbassador?.full_name ?? fallbackDiver?.fullName ?? "Commercial Diver";
  const certRows =
    (certifications ?? []).length > 0
      ? (certifications ?? []).map((cert) => ({ name: cert.name, expiry_date: cert.expiry_date }))
      : (fallbackDiver?.certifications ?? []).map((name) => ({ name, expiry_date: null }));
  const highlights = Array.isArray(safeProfile?.ambassador_key_highlights)
    ? safeProfile.ambassador_key_highlights.filter((item): item is string => typeof item === "string")
    : [];

  return (
    <AmbassadorProfileView
      displayName={displayName}
      username={username}
      headline={safeProfile?.ambassador_public_headline || safeProfile?.headline || fallbackDiver?.headline || null}
      shortBio={safeProfile?.ambassador_short_bio || safeProfile?.bio || fallbackDiver?.bio || null}
      highlights={highlights}
      satHours={safeProfile?.sat_hours ?? fallbackDiver?.satHours ?? 0}
      diveHours={safeProfile?.dive_hours ?? fallbackDiver?.diveHours ?? 0}
      location={safeProfile?.location || fallbackDiver?.location || null}
      mobilizationNotice={safeProfile?.mobilization_notice || fallbackDiver?.mobilizationNotice || null}
      availabilityStatus={
        safeProfile?.availability_status === "deployed" || fallbackDiver?.availabilityStatus === "deployed"
          ? "deployed"
          : "available"
      }
      certifications={certRows}
      showCvLink={Boolean(safeProfile?.polished_cv_markdown || username === "gareth")}
    />
  );
}
