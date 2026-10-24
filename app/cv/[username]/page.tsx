import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { resolveFullCvAccess, showsReferences } from "@/lib/cv-access";
import { contextLineForCertificate, describeCertificateDates, resolveCertificateDates } from "@/lib/dates";
import { polishedCvJsonSchema } from "@/lib/diver-profile";
import { CONTACT_MAILTO, SITE_URL } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isIndexableAmbassadorUsername } from "@/lib/usernames";
import { cn } from "@/lib/utils";

function formatDate(dateValue?: string | null) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString("en-GB", { year: "numeric", month: "short" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: rawUsername } = await params;
  const username = rawUsername.trim().toLowerCase();
  if (!isIndexableAmbassadorUsername(username)) {
    return { title: "CV", robots: { index: false, follow: false } };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("public_diver_ambassador")
    .select("full_name, ambassador_public_headline, headline")
    .eq("username", username)
    .maybeSingle();

  const name = data?.full_name || username;
  const description =
    data?.ambassador_public_headline || data?.headline || `Commercial diver CV on doneunder.ai`;

  return {
    title: `${name} · CV | doneunder.ai`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${name} · CV`,
      description,
      url: `${SITE_URL}/cv/${username}`,
    },
  };
}

export default async function DiverCvPage({
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
      "user_id,full_name,headline,bio,location,mobilization_notice,sat_hours,dive_hours,ambassador_public_headline,ambassador_short_bio",
    )
    .eq("username", username)
    .maybeSingle();

  if (!publicAmbassador) notFound();

  const access = await resolveFullCvAccess(publicAmbassador.user_id);
  const fullName = publicAmbassador.full_name ?? "Commercial Diver";
  const headline =
    publicAmbassador.ambassador_public_headline ||
    publicAmbassador.headline ||
    "Commercial Diver CV";
  const location = publicAmbassador.location || "Location not provided";
  const summary =
    publicAmbassador.ambassador_short_bio ||
    publicAmbassador.bio ||
    "Professional summary not provided yet.";

  if (!access.allowed) {
    const needsCompany =
      access.reason === "anonymous" ||
      access.reason === "company_inactive" ||
      access.reason === "diver_other" ||
      access.reason === "unknown";

    return (
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10 text-sm leading-relaxed">
        <div>
          <Link
            href={`/${username}`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "inline-flex")}
          >
            ← Ambassador page
          </Link>
        </div>

        <header className="space-y-2 border-b border-border/60 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Full CV locked
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
            {fullName}
          </h1>
          <p className="text-base font-medium text-heading-muted sm:text-lg">{headline}</p>
          <p className="text-muted-foreground">{location}</p>
        </header>

        <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-5">
          <p className="text-heading/90 line-clamp-4">{summary}</p>
          <p className="text-sm text-muted-foreground">
            Experience history, certificate numbers, and references stay private. Hiring teams with an
            active company subscription can unlock the full living CV. Divers use DoneUnder free.
          </p>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
            {access.reason === "company_not_revealed" ? (
              <Link href="/company/search" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
                Find divers with Search &amp; Match
              </Link>
            ) : needsCompany ? (
              <>
                <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
                  Company sign in
                </Link>
                <a
                  href={CONTACT_MAILTO}
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}
                >
                  Request company access
                </a>
              </>
            ) : null}
            <Link
              href={`/${username}`}
              className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}
            >
              Back to public card
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const [{ data: experiences }, { data: certifications }, { data: references }, { data: profileExtras }] =
    await Promise.all([
      supabase
        .from("diver_experiences")
        .select("company,project_name,location,role_title,date_start,date_end,summary")
        .eq("diver_id", publicAmbassador.user_id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("diver_certifications")
        .select("name,issue_date,expiry_date,cert_number,issuing_body")
        .eq("diver_id", publicAmbassador.user_id)
        .order("sort_order", { ascending: true }),
      showsReferences(access)
        ? supabase
            .from("diver_references")
            .select("name,company,phone,email")
            .eq("diver_id", publicAmbassador.user_id)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as { name: string; company: string | null; phone: string | null; email: string | null }[] }),
      supabase
        .from("diver_profiles")
        .select("polished_cv_json,polished_cv_markdown")
        .eq("user_id", publicAmbassador.user_id)
        .maybeSingle(),
    ]);

  const polishedJson = polishedCvJsonSchema.safeParse(profileExtras?.polished_cv_json).data;
  const displayExperiences =
    (experiences?.length ?? 0) > 0 ? experiences ?? [] : polishedJson?.experiences ?? [];
  const displayCertifications =
    (certifications?.length ?? 0) > 0 ? certifications ?? [] : polishedJson?.certifications ?? [];
  const displayReferences =
    (references?.length ?? 0) > 0
      ? references ?? []
      : (showsReferences(access) ? polishedJson?.references ?? [] : []).map((item) => ({
          name: item.name,
          company: item.company,
          phone: item.phone ?? null,
          email: item.email ?? null,
        }));

  const mobilization = publicAmbassador.mobilization_notice || "Mobilization not provided";
  const satHours =
    publicAmbassador.sat_hours && publicAmbassador.sat_hours > 0
      ? publicAmbassador.sat_hours.toLocaleString()
      : "Not declared";
  const diveHours =
    publicAmbassador.dive_hours && publicAmbassador.dive_hours > 0
      ? publicAmbassador.dive_hours.toLocaleString()
      : "Not declared";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 text-sm leading-relaxed print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <Link
          href={`/${username}`}
          className={cn(buttonVariants({ size: "sm", variant: "outline" }), "inline-flex")}
        >
          ← Ambassador page
        </Link>
      </div>

      <header className="space-y-2 border-b border-border/60 pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          doneunder.ai/{username}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
          {fullName}
        </h1>
        <p className="text-base font-medium text-heading-muted sm:text-lg">{headline}</p>
        <p className="text-muted-foreground">
          {location} · {mobilization}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="font-display text-xl font-semibold text-heading">Professional Summary</h2>
        <p className="text-heading/90">{summary}</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-display text-xl font-semibold text-heading">Career Metrics</h2>
        <p className="text-heading/90">Total Saturation Hours: {satHours}</p>
        <p className="text-heading/90">Total Dive Hours: {diveHours}</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-heading">Professional Experience</h2>
        {displayExperiences.length > 0 ? (
          <ul className="space-y-3">
            {displayExperiences.map((item, index) => {
              const start = formatDate(item.date_start);
              const end = formatDate(item.date_end);
              return (
                <li
                  key={`${item.company}-${item.role_title}-${index}`}
                  className="rounded-xl border border-border/60 bg-card/60 p-4"
                >
                  <p className="font-semibold text-heading">
                    {item.role_title} · {item.company}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[item.project_name, item.location].filter(Boolean).join(" · ")}
                    {start || end ? ` · ${start ?? "Start"} – ${end ?? "Present"}` : ""}
                  </p>
                  {item.summary ? <p className="mt-2 text-heading/90">{item.summary}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground">No project history has been added yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-heading">Certifications</h2>
        {displayCertifications.length > 0 ? (
          <ul className="space-y-3">
            {displayCertifications.map((item, index) => {
              const dates = resolveCertificateDates({
                name: item.name,
                issuingBody: item.issuing_body,
                issueDate: item.issue_date,
                expiryDate: item.expiry_date,
                context: contextLineForCertificate(
                  (profileExtras as { polished_cv_markdown?: string | null } | null)?.polished_cv_markdown,
                  item.name ?? "",
                ),
              });
              return (
              <li
                key={`${item.name}-${index}`}
                className="rounded-xl border border-border/60 bg-card/60 p-4"
              >
                <p className="font-semibold text-heading">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[item.issuing_body, item.cert_number ? `#${item.cert_number}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {describeCertificateDates(dates.issue_date, dates.expiry_date)}
                </p>
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground">No certifications listed yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-heading">References</h2>
        {displayReferences.length > 0 ? (
          <ul className="space-y-3">
            {displayReferences.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="rounded-xl border border-border/60 bg-card/60 p-4"
              >
                <p className="font-semibold text-heading">{item.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[item.company, item.phone, item.email].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">References available on request.</p>
        )}
      </section>
    </main>
  );
}
