import Link from "next/link";
import type { Metadata } from "next";
import { CompanyLandingCta } from "@/components/company/landing-cta";
import { CompanyLandingViewTracker } from "@/components/company/landing-view-tracker";
import { Button } from "@/components/ui/button";
import {
  COMPANY_LANDING_VARIANTS,
  resolveCompanyLandingVariant,
} from "@/lib/company-landing-copy";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/site";

export const metadata: Metadata = {
  title: "For companies | doneunder.ai",
  description:
    "Search verified commercial diving ambassadors. See match counts with locked previews, then unlock full profiles.",
};

export default async function CompanyLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const variant = resolveCompanyLandingVariant(v);
  const copy = COMPANY_LANDING_VARIANTS[variant];
  const registerHref = `/company/register?v=${variant}`;

  return (
    <div className="overflow-x-hidden">
      <CompanyLandingViewTracker variant={variant} />
      <section className="relative mx-auto w-full max-w-6xl section-pad pb-16 pt-12 sm:pt-16 md:pb-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(ellipse_at_top,rgba(30,200,224,0.14),transparent_55%),linear-gradient(180deg,var(--surface-muted),transparent)]"
        />
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            doneunder.ai · companies
          </p>
          <h1 className="mt-5 font-display text-[2.15rem] font-semibold leading-[1.08] tracking-tight text-heading sm:text-5xl md:text-[3.1rem]">
            {copy.headline}
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            {copy.support}
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <CompanyLandingCta variant={variant} href={registerHref}>
              Skapa företagskonto
            </CompanyLandingCta>
            <Link href="/company/search">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Redan kund — sök kandidater
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Inte en vanlig jobbannons-sida. Du ser hur många som matchar innan du betalar — initialer
            och bransch syns, resten låses upp.
          </p>
        </div>
      </section>

      <section className="border-t border-border/40 bg-surface-muted">
        <div className="mx-auto grid w-full max-w-6xl gap-10 section-pad py-14 md:grid-cols-3 md:py-20">
          {[
            {
              title: "Verifierade ambassadörer",
              body: "Publicerade commercial divers med Hermes-CV och synliga ticket-signaler — inte anonyma jobbansökningar.",
            },
            {
              title: "Träffar före betalning",
              body: "Prata eller klistra in till Hermes. Se antalet matchningar och låsta kort (initialer + bransch) medan sökningen kör i bakgrunden. Betala bara när sökningen är värd att öppna.",
            },
            {
              title: "Engångs eller månad",
              body: "Lås upp just den här sökningen en gång, eller ta månadsaccess för löpande Search & Match.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h2 className="font-display text-xl font-semibold text-heading">{item.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl section-pad py-12 md:py-16">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-sm text-muted-foreground">
            Frågor om onboarding eller fakturering:{" "}
            <a href={CONTACT_MAILTO} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Divers register free at{" "}
            <Link href="/register" className="text-heading-muted hover:underline">
              /register
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
