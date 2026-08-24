import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/site";
import { loadPublicAmbassadorCards } from "@/lib/public-ambassadors";
import {
  AgentChatMockup,
  HeroProductMockup,
  PipelineVisual,
} from "@/components/landing/product-mockups";

const pipeline = [
  {
    id: "01",
    key: "find" as const,
    title: "Find the right campaigns early",
    body: "Hermes watches for Offshore and Inshore scopes that fit your certifications, location, and mobilization window — not generic job boards.",
  },
  {
    id: "02",
    key: "prep" as const,
    title: "Prep a recruiter-ready profile",
    body: "Upload CV and certs. Hermes rewrites headlines, surfaces gaps, and keeps medicals and tickets readable for contractors.",
  },
  {
    id: "03",
    key: "match" as const,
    title: "Match with explainable scores",
    body: "See why a campaign fits — IMCA, NDT, sat hours, notice period — before you spend time chasing the wrong lead.",
  },
  {
    id: "04",
    key: "mobilize" as const,
    title: "Stay mobilization-ready",
    body: "Track documents, publish your ambassador page, and talk to Hermes when a short-notice call comes in.",
  },
];

export default async function Home() {
  const ambassadors = await loadPublicAmbassadorCards(4);

  return (
    <div className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative mx-auto w-full max-w-6xl section-pad pb-16 pt-10 sm:pt-14 md:pb-24 md:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="animate-fade-up flex flex-col items-center gap-3">
            <Image
              src="/doneunder_logo.jpg"
              alt="doneunder.ai logo"
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-full object-cover shadow-[0_0_40px_-12px_rgba(30,200,224,0.55)]"
              priority
            />
            <p className="font-display text-sm font-semibold tracking-[0.18em] text-primary uppercase sm:text-base">
              doneunder.ai
            </p>
          </div>
          <h1 className="animate-fade-up-delay-1 mt-4 font-display text-[2.15rem] font-semibold leading-[1.08] tracking-tight text-cyan-50 sm:text-5xl md:text-[3.25rem]">
            Your commercial diving agent. Built for Offshore and Inshore work.
          </h1>
          <p className="animate-fade-up-delay-2 mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Upload your CV. Hermes reviews certifications, finds matching Offshore and Inshore
            campaigns, and keeps you mobilization-ready — for divers and the contractors who hire
            them.
          </p>
          <div className="animate-fade-up-delay-2 mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                Get started free
              </Button>
            </Link>
            <Link href="#pipeline" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                See how it works
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Free for divers. Companies:{" "}
            <a href={CONTACT_MAILTO} className="text-cyan-100/80 hover:text-cyan-50">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>

        <div className="animate-fade-up-delay-2 mx-auto mt-12 max-w-5xl md:mt-16">
          <HeroProductMockup />
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="border-t border-border/40 bg-[#040a12]/60">
        <div className="mx-auto w-full max-w-6xl section-pad py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              The pipeline
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-cyan-50 sm:text-4xl">
              Four stages. One agent. Zero spreadsheets.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              From CV upload to short-notice mobilization across Offshore and Inshore scopes —
              Hermes keeps the diving career workflow in one thread.
            </p>
          </div>

          <div className="mt-12 space-y-14 md:space-y-20">
            {pipeline.map((item, index) => (
              <div
                key={item.id}
                className={`grid items-center gap-8 md:grid-cols-2 md:gap-12 ${
                  index % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <p className="font-mono text-xs text-primary/80">
                    {item.id} · {item.key}
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-cyan-50">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-muted-foreground">{item.body}</p>
                </div>
                <PipelineVisual step={item.key} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live example */}
      <section id="matches" className="border-t border-border/40">
        <div className="mx-auto w-full max-w-6xl section-pad py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Live example
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-cyan-50 sm:text-4xl">
              Matches that speak contractor language.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              IMCA, sat hours, NDT tickets, notice period — scored and explained, not buried in a
              PDF.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-2xl border border-border/60">
            <div className="relative h-44 sm:h-56 md:h-64">
              <Image
                src="/images/offshore-operation-team.jpeg"
                alt="Offshore commercial diving team preparing equipment"
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 1152px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#03070d] via-[#03070d]/40 to-transparent" />
            </div>
            <div className="grid gap-px bg-border/40 sm:grid-cols-3">
              {[
                { label: "Urgent sat welders", meta: "Aberdeen · 94% fit", detail: "IMCA + CSWIP" },
                { label: "Wind inspection team", meta: "North Sea · 88% fit", detail: "PCN NDT" },
                { label: "Pipeline tie-in", meta: "Baltic · 81% fit", detail: "ADCI + BOSIET" },
              ].map((row) => (
                <div key={row.label} className="bg-[#060e18] p-5">
                  <p className="font-medium text-cyan-50">{row.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{row.meta}</p>
                  <p className="mt-3 text-xs text-primary/90">{row.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Agent */}
      <section id="agent" className="border-t border-border/40 bg-[#040a12]/60">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 section-pad py-16 md:grid-cols-2 md:gap-14 md:py-24">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Agent experience
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-cyan-50 sm:text-4xl">
              Talk to Hermes like a dedicated diving recruiter.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Review your profile, tighten your headline, upload certificates, and ask for matching
            campaigns — or just tell Hermes what to change on your CV. The whole thread stays in
            English.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-cyan-50/90">
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Thread-scoped to your account — update your CV by talking, not filling forms
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Proactive job suggestions with scores you can act on
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                Built for Offshore and Inshore diving terminology, not generic HR chatbots
              </li>
            </ul>
            <div className="mt-8">
              <Link href="/register">
                <Button size="lg">Start chatting with Hermes</Button>
              </Link>
            </div>
          </div>
          <AgentChatMockup />
        </div>
      </section>

      {/* Social proof */}
      <section id="divers" className="border-t border-border/40">
        <div className="mx-auto w-full max-w-6xl section-pad py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Ambassadors
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-cyan-50 sm:text-4xl">
              Profiles contractors can trust at a glance.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Live ambassador pages only — published divers with a current pack, not sample profiles.
            </p>
          </div>

          {ambassadors.length === 0 ? (
            <p className="mt-10 text-sm text-muted-foreground">
              No public ambassador pages yet. Create a free account and publish yours with Hermes.
            </p>
          ) : (
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {ambassadors.map((diver) => (
                <Link
                  key={diver.username}
                  href={`/${diver.username}`}
                  className="group block rounded-xl border border-border/60 bg-[#060e18]/80 p-5 transition hover:border-primary/35 hover:bg-[#081422]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold text-cyan-50 group-hover:text-white">
                        {diver.fullName}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{diver.headline}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                      Live
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {diver.location ? <span>{diver.location}</span> : null}
                    {diver.location && diver.availabilityStatus ? <span className="text-border">·</span> : null}
                    {diver.availabilityStatus ? (
                      <span className="capitalize">{diver.availabilityStatus}</span>
                    ) : null}
                    {diver.mobilizationNotice ? (
                      <>
                        <span className="text-border">·</span>
                        <span>{diver.mobilizationNotice}</span>
                      </>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/40">
        <div className="mx-auto w-full max-w-6xl section-pad py-16 md:py-24">
          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-[#06111c] px-6 py-12 text-center sm:px-10 md:py-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,200,224,0.12),transparent_55%)]" />
            <div className="relative">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-cyan-50 sm:text-4xl">
                Get mobilization-ready tonight.
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
                Create a free diver account, upload your CV, and let Hermes start matching you to
                Offshore and Inshore campaigns that fit.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link href="/register" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto">
                    Create free account
                  </Button>
                </Link>
                <Link href="/login" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    Sign in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
