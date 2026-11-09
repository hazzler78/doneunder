import Link from "next/link";
import { Button } from "@/components/ui/button";
import { COMPANY_BILLING } from "@/lib/company-billing";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/site";

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl section-pad py-12 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Companies</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
          Search verified divers. Pay when the match list is worth opening.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Divers use doneunder.ai free. Hiring desks register, run a search, see the match count with
          locked previews (initials + industry), then unlock.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card/90 p-5 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {COMPANY_BILLING.oneTime.shortLabel}
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-heading">
            {COMPANY_BILLING.oneTime.label}
          </h2>
          <p className="mt-1 text-lg font-medium text-heading">{COMPANY_BILLING.oneTime.displayPrice}</p>
          <p className="mt-3 text-sm text-muted-foreground">{COMPANY_BILLING.oneTime.detail}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/90 p-5 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {COMPANY_BILLING.monthly.shortLabel}
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-heading">
            {COMPANY_BILLING.monthly.label}
          </h2>
          <p className="mt-1 text-lg font-medium text-heading">{COMPANY_BILLING.monthly.displayPrice}</p>
          <p className="mt-3 text-sm text-muted-foreground">{COMPANY_BILLING.monthly.detail}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link href="/company">
          <Button size="lg" className="w-full sm:w-auto">
            Company landing
          </Button>
        </Link>
        <Link href="/company/register">
          <Button size="lg" variant="outline" className="w-full sm:w-auto">
            Create company account
          </Button>
        </Link>
        <Link href="/register">
          <Button size="lg" variant="ghost" className="w-full sm:w-auto">
            I am a diver
          </Button>
        </Link>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Questions:{" "}
        <a href={CONTACT_MAILTO} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
