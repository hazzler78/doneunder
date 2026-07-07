import Link from "next/link";
import { redirect } from "next/navigation";
import { AmbassadorProfileView } from "@/components/ambassador-profile-view";
import { buttonVariants } from "@/components/ui/button";
import { getDiverProfile } from "@/lib/diver-profile-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

export const metadata = {
  title: "Preview ambassador page | doneunder.ai",
  robots: { index: false, follow: false },
};

export default async function AmbassadorPreviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("role, full_name, username")
    .eq("id", user.id)
    .maybeSingle();

  const role = (userRow?.role as UserRole | undefined) ?? "diver";
  if (role !== "diver") {
    redirect("/workspace");
  }

  const profile = await getDiverProfile(supabase, user.id);
  const username = userRow?.username ?? `diver-${user.id.slice(0, 8)}`;
  const displayName = userRow?.full_name ?? "Commercial Diver";
  const p = profile.profile;
  const isPublished = p.profile_status === "published";

  return (
    <AmbassadorProfileView
      displayName={displayName}
      username={username}
      headline={p.ambassador_public_headline || p.headline || "Commercial Diver"}
      shortBio={p.ambassador_short_bio || p.bio || "Professional summary not provided yet."}
      highlights={p.ambassador_key_highlights ?? []}
      satHours={p.sat_hours}
      diveHours={p.dive_hours}
      location={p.location || null}
      mobilizationNotice={p.mobilization_notice || null}
      availabilityStatus={p.availability_status}
      certifications={profile.certifications.map((cert) => ({
        name: cert.name,
        expiry_date: cert.expiry_date,
      }))}
      showRequestButton={false}
      showCvLink
      previewBanner={
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm">
          <p className="font-medium text-amber-200">Draft preview — only you can see this page.</p>
          <p className="mt-1 text-muted-foreground">
            {isPublished
              ? `Your profile is published at /${username}. This preview still shows your current draft data.`
              : `Your public page is not live yet. Publish from workspace chat when you are ready for https://doneunder.ai/${username}.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/workspace" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              Back to workspace
            </Link>
            {isPublished ? (
              <Link href={`/${username}`} className={cn(buttonVariants({ size: "sm" }))} target="_blank">
                View live page
              </Link>
            ) : null}
          </div>
        </div>
      }
    />
  );
}
