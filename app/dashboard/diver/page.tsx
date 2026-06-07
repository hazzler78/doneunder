import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DiverProfileEditor } from "@/components/diver-profile-editor";
import { getDiverProfile } from "@/lib/diver-profile-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DiverDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
        <h1 className="text-3xl font-bold">Diver Dashboard</h1>
        <Card>
          <CardHeader>
            <CardTitle>Login required</CardTitle>
            <CardDescription>Sign in as a diver account to edit your profile and CV sections.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm" variant="outline">
                Create account
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fullProfile = await getDiverProfile(supabase, auth.user.id);
  const { profile, experiences, certifications, references } = fullProfile;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Diver Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Editable CV and profile</CardTitle>
          <CardDescription>
            Save your profile fields, certifications, references, and project history. Status:{" "}
            <span className="text-cyan-200">{profile.profile_status}</span>
            {profile.published_at ? ` (published ${new Date(profile.published_at).toLocaleDateString("en-GB")})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiverProfileEditor
            initialData={{
              profile: {
                headline: profile.headline,
                bio: profile.bio,
                location: profile.location,
                mobilization_notice: profile.mobilization_notice,
                availability_status: profile.availability_status,
                sat_hours: profile.sat_hours,
                dive_hours: profile.dive_hours,
                polished_cv_markdown: profile.polished_cv_markdown ?? "",
                polished_cv_json: profile.polished_cv_json,
                ambassador_public_headline: profile.ambassador_public_headline ?? "",
                ambassador_short_bio: profile.ambassador_short_bio ?? "",
                ambassador_key_highlights: profile.ambassador_key_highlights,
                headline_source: profile.headline_source,
                headline_source_ref: profile.headline_source_ref ?? undefined,
                bio_source: profile.bio_source,
                bio_source_ref: profile.bio_source_ref ?? undefined,
                import_batch_id: profile.import_batch_id,
              },
              experiences,
              certifications,
              references,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
