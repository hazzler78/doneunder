import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { divers } from "@/lib/mock-data";

function formatDate(dateValue?: string | null) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;
  return parsed.toLocaleDateString("en-GB", { year: "numeric", month: "short" });
}

export default async function DiverCvPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: publicAmbassador } = await supabase
    .from("public_diver_ambassador")
    .select(
      "user_id,full_name,headline,bio,location,mobilization_notice,sat_hours,dive_hours,polished_cv_markdown",
    )
    .eq("username", username)
    .maybeSingle();

  const fallbackDiver = divers.find((entry) => entry.username === username);
  if (!publicAmbassador && !fallbackDiver) notFound();

  const [{ data: experiences }, { data: certifications }, { data: references }] = await Promise.all([
    supabase
      .from("diver_experiences")
      .select("company,project_name,location,role_title,date_start,date_end,summary")
      .eq("diver_id", publicAmbassador?.user_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("diver_certifications")
      .select("name,issue_date,expiry_date,cert_number,issuing_body")
      .eq("diver_id", publicAmbassador?.user_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("diver_references")
      .select("name,company,phone,email")
      .eq("diver_id", publicAmbassador?.user_id)
      .order("sort_order", { ascending: true }),
  ]);

  const fullName = publicAmbassador?.full_name ?? fallbackDiver?.fullName ?? "Commercial Diver";
  const headline = publicAmbassador?.headline ?? fallbackDiver?.headline ?? "Commercial Diver CV";
  const location = publicAmbassador?.location || fallbackDiver?.location || "Location not provided";
  const mobilization = publicAmbassador?.mobilization_notice || fallbackDiver?.mobilizationNotice || "Mobilization not provided";
  const summary = publicAmbassador?.bio || fallbackDiver?.bio || "Professional summary not provided yet.";
  const satHours =
    publicAmbassador?.sat_hours && publicAmbassador.sat_hours > 0
      ? publicAmbassador.sat_hours.toLocaleString()
      : "Not declared";
  const diveHours =
    publicAmbassador?.dive_hours && publicAmbassador.dive_hours > 0
      ? publicAmbassador.dive_hours.toLocaleString()
      : "Not declared";
  const hasStructuredCv = (experiences?.length ?? 0) > 0 || (certifications?.length ?? 0) > 0 || (references?.length ?? 0) > 0;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 text-sm leading-relaxed print:max-w-none print:px-0 print:py-0">
      <header className="space-y-2 border-b pb-4">
        <h1 className="text-3xl font-bold">{fullName}</h1>
        <p className="font-semibold">{headline}</p>
        <p>
          {location} • {mobilization}
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
        {(experiences ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(experiences ?? []).map((item, index) => {
              const start = formatDate(item.date_start);
              const end = formatDate(item.date_end);
              return (
                <li key={`${item.company}-${item.role_title}-${index}`} className="rounded-md border p-3">
                  <p className="font-semibold">{item.role_title} • {item.company}</p>
                  <p className="text-xs text-muted-foreground">
                    {[item.project_name, item.location].filter(Boolean).join(" • ")}
                    {(start || end) ? ` • ${start ?? "Start"} - ${end ?? "Present"}` : ""}
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
        {(certifications ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(certifications ?? []).map((item, index) => (
              <li key={`${item.name}-${index}`} className="rounded-md border p-3">
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[item.issuing_body, item.cert_number ? `#${item.cert_number}` : null].filter(Boolean).join(" • ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Issued: {formatDate(item.issue_date) ?? "Not provided"} • Expires: {formatDate(item.expiry_date) ?? "Not provided"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="list-disc pl-5">
            {(fallbackDiver?.certifications ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">References</h2>
        {(references ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(references ?? []).map((item, index) => (
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

      {hasStructuredCv && publicAmbassador?.polished_cv_markdown ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">AI Polished CV Draft</h2>
          <pre className="whitespace-pre-wrap rounded-lg border bg-[#071725] p-4 font-sans text-sm">
            {publicAmbassador.polished_cv_markdown}
          </pre>
        </section>
      ) : null}

      <section>
        <p className="text-xs text-amber-300">AI-generated - always verify details before sending to clients.</p>
      </section>
    </main>
  );
}
