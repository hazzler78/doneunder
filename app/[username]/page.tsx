import { notFound } from "next/navigation";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RequestProfileButton } from "@/components/request-profile-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function AmbassadorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase
    .from("users")
    .select("id,username,full_name")
    .eq("username", username)
    .eq("role", "diver")
    .maybeSingle();
  if (!user) notFound();

  const [{ data: profile }, { data: certifications }] = await Promise.all([
    supabase
      .from("diver_profiles")
      .select(
        "headline,bio,sat_hours,dive_hours,location,mobilization_notice,availability_status,polished_cv_markdown,ambassador_public_headline,ambassador_short_bio,ambassador_key_highlights",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("diver_certifications")
      .select("name,expiry_date")
      .eq("diver_id", user.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!profile) notFound();
  const satHours = profile.sat_hours > 0 ? profile.sat_hours.toLocaleString() : "Not declared";
  const diveHours = profile.dive_hours > 0 ? profile.dive_hours.toLocaleString() : "Not declared";
  const certLabels = (certifications ?? []).map((cert) =>
    cert.expiry_date ? `${cert.name} (Exp ${cert.expiry_date})` : cert.name,
  );
  const headline = profile.ambassador_public_headline || profile.headline;
  const shortBio = profile.ambassador_short_bio || profile.bio;
  const highlights = Array.isArray(profile.ambassador_key_highlights)
    ? profile.ambassador_key_highlights.filter((item): item is string => typeof item === "string")
    : [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <Card>
        <div className="relative h-64 overflow-hidden rounded-t-xl border-b border-border md:h-80">
          <Image
            src="/images/ambassador-profile-shot.jpeg"
            alt={`${user.full_name} ambassador profile`}
            fill
            className="object-cover"
            priority
          />
        </div>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{user.full_name}</h1>
              <p className="mt-2 text-cyan-200">{headline}</p>
            </div>
            <Badge className={profile.availability_status === "available" ? "bg-emerald-900/60" : ""}>
              {profile.availability_status === "available" ? "Available Now" : "Deployed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{shortBio}</p>
          <p className="text-muted-foreground">
            Sat hours: {satHours} • Dive hours: {diveHours} • {profile.location || "Location not provided"}
          </p>
          <p className="text-cyan-200">{profile.mobilization_notice || "Mobilization notice not provided"}</p>
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
            {profile.polished_cv_markdown ? (
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
