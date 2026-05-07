import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DiverProfileEditor } from "@/components/diver-profile-editor";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
        </Card>
      </div>
    );
  }

  const [{ data: profile }, { data: experiences }, { data: certifications }, { data: references }] = await Promise.all([
    supabase
      .from("diver_profiles")
      .select(
        "headline,bio,location,mobilization_notice,availability_status,sat_hours,dive_hours,headline_source,headline_source_ref,bio_source,bio_source_ref,import_batch_id",
      )
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    supabase
      .from("diver_experiences")
      .select("id,company,project_name,location,role_title,date_start,date_end,summary,source,source_ref")
      .eq("diver_id", auth.user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("diver_certifications")
      .select("id,name,issue_date,expiry_date,cert_number,issuing_body,source,source_ref")
      .eq("diver_id", auth.user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("diver_references")
      .select("id,name,company,phone,email,source,source_ref")
      .eq("diver_id", auth.user.id)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Diver Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Editable CV and profile</CardTitle>
          <CardDescription>
            Save your profile fields, certifications, references, and project history. This schema is ready for future
            LinkedIn import mapping.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiverProfileEditor
            initialData={{
              profile: {
                headline: profile?.headline ?? "",
                bio: profile?.bio ?? "",
                location: profile?.location ?? "",
                mobilization_notice: profile?.mobilization_notice ?? "",
                availability_status: profile?.availability_status === "deployed" ? "deployed" : "available",
                sat_hours: profile?.sat_hours ?? 0,
                dive_hours: profile?.dive_hours ?? 0,
                headline_source: profile?.headline_source ?? "manual",
                headline_source_ref: profile?.headline_source_ref ?? undefined,
                bio_source: profile?.bio_source ?? "manual",
                bio_source_ref: profile?.bio_source_ref ?? undefined,
                import_batch_id: profile?.import_batch_id ?? null,
              },
              experiences: experiences ?? [],
              certifications: certifications ?? [],
              references: references ?? [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
