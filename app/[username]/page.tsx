import { notFound } from "next/navigation";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RequestProfileButton } from "@/components/request-profile-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
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
  const satHours =
    safeProfile?.sat_hours && safeProfile.sat_hours > 0
      ? safeProfile.sat_hours.toLocaleString()
      : fallbackDiver?.satHours && fallbackDiver.satHours > 0
        ? fallbackDiver.satHours.toLocaleString()
        : "Not declared";
  const diveHours =
    safeProfile?.dive_hours && safeProfile.dive_hours > 0
      ? safeProfile.dive_hours.toLocaleString()
      : fallbackDiver?.diveHours && fallbackDiver.diveHours > 0
        ? fallbackDiver.diveHours.toLocaleString()
        : "Not declared";
  const certLabels =
    (certifications ?? []).length > 0
      ? (certifications ?? []).map((cert) =>
          cert.expiry_date ? `${cert.name} (Exp ${cert.expiry_date})` : cert.name,
        )
      : (fallbackDiver?.certifications ?? []);
  const headline = safeProfile?.ambassador_public_headline || safeProfile?.headline || fallbackDiver?.headline;
  const shortBio = safeProfile?.ambassador_short_bio || safeProfile?.bio || fallbackDiver?.bio;
  const highlights = Array.isArray(safeProfile?.ambassador_key_highlights)
    ? safeProfile.ambassador_key_highlights.filter((item): item is string => typeof item === "string")
    : [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <Card>
        <div className="relative h-64 overflow-hidden rounded-t-xl border-b border-border md:h-80">
          <Image
            src="/images/ambassador-profile-shot.jpeg"
            alt={`${displayName} ambassador profile`}
            fill
            className="object-cover"
            priority
          />
        </div>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{displayName}</h1>
              <p className="mt-2 text-cyan-200">{headline}</p>
            </div>
            <Badge className={(safeProfile?.availability_status ?? fallbackDiver?.availabilityStatus) === "available" ? "bg-emerald-900/60" : ""}>
              {(safeProfile?.availability_status ?? fallbackDiver?.availabilityStatus) === "available"
                ? "Available Now"
                : "Deployed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{shortBio}</p>
          <p className="text-muted-foreground">
            Sat hours: {satHours} • Dive hours: {diveHours} •{" "}
            {safeProfile?.location || fallbackDiver?.location || "Location not provided"}
          </p>
          <p className="text-cyan-200">
            {safeProfile?.mobilization_notice || fallbackDiver?.mobilizationNotice || "Mobilization notice not provided"}
          </p>
          {highlights.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {certLabels.map((cert) => (
              <Badge key={cert}>{cert}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <RequestProfileButton username={username} />
            {safeProfile?.polished_cv_markdown || username === "gareth" ? (
              <a
                href={`/cv/${username}`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
              >
                Open CV (Print/PDF)
              </a>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
