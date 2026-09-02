import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { daysUntilClose, loadOpenJobs, workspaceMatchHref } from "@/lib/jobs";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/feature-flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jobs | doneunder.ai",
  description:
    "Open commercial diving campaigns. Match in Hermes. Applications go to hello@doneunder.ai until a contractor gives an inbox. Listings drop off when they close.",
};

function formatDay(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default async function JobsPage() {
  const supabase = isSupabaseConfigured() ? await createSupabaseServerClient() : null;
  const jobs = await loadOpenJobs(supabase);

  return (
    <div className="mx-auto w-full max-w-6xl section-pad py-12 md:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Jobs</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
          Open campaigns. Closed when the window closes.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Scopes Hermes can match you against. Apply sends your living CV and tickets to{" "}
          {CONTACT_EMAIL} until a contractor gives us their inbox. When a listing hits its close
          date, it leaves this board.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border/60 bg-card/90 p-6">
          <p className="text-heading">No open campaigns right now.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Build your CV with Hermes so you are ready for the next window. Companies: email{" "}
            <a href={CONTACT_MAILTO} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {jobs.map((job) => {
            const days = daysUntilClose(job.closesAt);
            const closing =
              days === null ? null : days <= 1 ? "Closes today" : `Closes in ${days} days`;
            return (
              <article
                key={job.id}
                className="flex flex-col rounded-2xl border border-border/60 bg-card/90 p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border/70 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {job.scope}
                  </span>
                  {closing ? (
                    <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {closing}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-heading">
                  {job.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{job.description}</p>
                <dl className="mt-4 space-y-1 text-sm text-heading-muted/80">
                  <div>
                    <dt className="sr-only">Location</dt>
                    <dd>{job.location}</dd>
                  </div>
                  {job.startDate ? (
                    <div>
                      <dt className="inline text-muted-foreground">Starts </dt>
                      <dd className="inline">{formatDay(job.startDate)}</dd>
                    </div>
                  ) : null}
                  {job.closesAt ? (
                    <div>
                      <dt className="inline text-muted-foreground">Apply by </dt>
                      <dd className="inline">{formatDay(job.closesAt)}</dd>
                    </div>
                  ) : null}
                  {job.mobilization ? (
                    <div>
                      <dt className="inline text-muted-foreground">Mobilisation </dt>
                      <dd className="inline">{job.mobilization}</dd>
                    </div>
                  ) : null}
                </dl>
                {job.requiredCerts.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {job.requiredCerts.map((cert) => (
                      <li
                        key={cert}
                        className="rounded-md border border-border/70 bg-muted/20 px-2 py-0.5 text-[11px] text-heading-muted/80"
                      >
                        {cert}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-5">
                  <Link href={workspaceMatchHref(job.id)}>
                    <Button className="w-full sm:w-auto">Match in Hermes</Button>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        Free for divers. Companies who want a campaign listed:{" "}
        <a href={CONTACT_MAILTO} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
