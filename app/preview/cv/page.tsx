import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getDiverProfile } from "@/lib/diver-profile-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

export const metadata = {
  title: "Preview CV | doneunder.ai",
  robots: { index: false, follow: false },
};

function formatDate(dateValue?: string | null) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString("en-GB", { year: "numeric", month: "short" });
}

export default async function CvPreviewPage() {
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
  const p = profile.profile;
  const fullName = userRow?.full_name ?? "Commercial Diver";
  const headline = p.ambassador_public_headline || p.headline || "Commercial Diver CV";
  const summary = p.ambassador_short_bio || p.bio || "Professional summary not provided yet.";
  const satHours = p.sat_hours > 0 ? p.sat_hours.toLocaleString() : "Not declared";
  const diveHours = p.dive_hours > 0 ? p.dive_hours.toLocaleString() : "Not declared";

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 text-sm leading-relaxed print:max-w-none print:px-0 print:py-0">
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 print:hidden">
        <p className="font-medium text-amber-200">Draft CV preview — only you can see this page.</p>
        <Link href="/preview" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-3 inline-flex")}>
          Back to ambassador preview
        </Link>
      </div>

      <header className="space-y-2 border-b pb-4">
        <h1 className="text-3xl font-bold">{fullName}</h1>
        <p className="font-semibold">{headline}</p>
        <p>
          {p.location || "Location not provided"} • {p.mobilization_notice || "Mobilization not provided"}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Professional Summary</h2>
        <p>{summary}</p>
      </section>

      <section className="space-y-1">
        <h2 className="text-xl font-semibold">Career Metrics</h2>
        <p>Total Saturation Hours: {satHours}</p>
        <p>Total Dive Hours: {diveHours}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Professional Experience</h2>
        {profile.experiences.length > 0 ? (
          <ul className="space-y-2">
            {profile.experiences.map((item, index) => {
              const start = formatDate(item.date_start);
              const end = formatDate(item.date_end);
              return (
                <li key={`${item.company}-${item.role_title}-${index}`} className="rounded-md border p-3">
                  <p className="font-semibold">
                    {item.role_title} • {item.company}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[item.project_name, item.location].filter(Boolean).join(" • ")}
                    {start || end ? ` • ${start ?? "Start"} - ${end ?? "Present"}` : ""}
                  </p>
                  {item.summary ? <p className="mt-1">{item.summary}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No project history has been added yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Certifications</h2>
        {profile.certifications.length > 0 ? (
          <ul className="space-y-2">
            {profile.certifications.map((item, index) => (
              <li key={`${item.name}-${index}`} className="rounded-md border p-3">
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.issuing_body, item.cert_number ? `#${item.cert_number}` : null].filter(Boolean).join(" • ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Issued: {formatDate(item.issue_date) ?? "Not provided"} • Expires:{" "}
                  {formatDate(item.expiry_date) ?? "Not provided"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No certifications listed yet.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">References</h2>
        {profile.references.length > 0 ? (
          <ul className="space-y-2">
            {profile.references.map((item, index) => (
              <li key={`${item.name}-${index}`} className="rounded-md border p-3">
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.company, item.phone, item.email].filter(Boolean).join(" • ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>References available on request.</p>
        )}
      </section>

      {p.polished_cv_markdown ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">AI Polished CV Draft</h2>
          <pre className="whitespace-pre-wrap rounded-lg border bg-[#071725] p-4 font-sans text-sm">
            {p.polished_cv_markdown}
          </pre>
        </section>
      ) : null}

      <section>
        <p className="text-xs text-amber-300">AI-generated — always verify details before sending to clients.</p>
      </section>
    </main>
  );
}
