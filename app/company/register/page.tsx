import Link from "next/link";
import type { Metadata } from "next";
import { registerCompanyAction } from "@/app/company/register/actions";
import { Button } from "@/components/ui/button";
import {
  COMPANY_LANDING_VARIANTS,
  resolveCompanyLandingVariant,
} from "@/lib/company-landing-copy";
import { safeInternalPath } from "@/lib/auth-paths";

export const metadata: Metadata = {
  title: "Company register | doneunder.ai",
  robots: { index: false, follow: false },
};

const fieldClass =
  "w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

export default async function CompanyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string; v?: string }>;
}) {
  const { message, next: nextRaw, v } = await searchParams;
  const variant = resolveCompanyLandingVariant(v);
  const copy = COMPANY_LANDING_VARIANTS[variant];
  const next = safeInternalPath(nextRaw, "/company/search");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center section-pad py-12 sm:py-16">
      <div className="mb-8 text-center">
        <p className="font-display text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          doneunder.ai · company
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading">
          {copy.headline}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.support}</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/90 p-5 sm:p-6">
        {message ? (
          <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {message}
          </p>
        ) : null}

        <form action={registerCompanyAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="variant" value={variant} />
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Company name</span>
            <input
              type="text"
              name="companyName"
              required
              autoComplete="organization"
              className={fieldClass}
              placeholder="North Sea Diving Ltd"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Your name</span>
            <input
              type="text"
              name="contactName"
              required
              autoComplete="name"
              className={fieldClass}
              placeholder="Alex Crewing"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Work email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className={fieldClass}
              placeholder="ops@contractor.com"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Password</span>
            <input
              type="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
              className={fieldClass}
              placeholder="Min. 8 characters"
            />
          </label>
          <Button type="submit" className="h-11 w-full">
            Create company account
          </Button>
        </form>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          After signup you can run a search and see match count plus locked previews (initials +
          industry). Unlock that search once, or start monthly access.
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link
          href={`/login?next=${encodeURIComponent("/company/search")}`}
          className="text-primary hover:underline"
        >
          Sign in
        </Link>
        {" · "}
        <Link href="/register" className="text-primary hover:underline">
          I am a diver
        </Link>
      </p>
    </div>
  );
}
