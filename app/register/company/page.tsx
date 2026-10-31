import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { registerCompanyAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { BILLING_PRICES_USD, type BillingProduct } from "@/lib/billing";
import { getSignedInBillingCompany } from "@/lib/billing-company";
import { companyCheckoutContinuePath, productFromSearchParam } from "@/lib/company-register";
import { isStripeConfigured } from "@/lib/feature-flags";

export const metadata: Metadata = {
  title: "Create company account | doneunder.ai",
  robots: { index: false, follow: false },
};

const PLAN_COPY: Record<BillingProduct, { name: string; price: string }> = {
  one_time: {
    name: "One search",
    price: `USD ${BILLING_PRICES_USD.one_time} one-time`,
  },
  monthly: {
    name: "Unlimited",
    price: `USD ${BILLING_PRICES_USD.monthly}/month`,
  },
};

export default async function RegisterCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; product?: string }>;
}) {
  const { message, product: productRaw } = await searchParams;
  const product = productFromSearchParam(productRaw);
  const billingOn = isStripeConfigured();

  if (product && billingOn) {
    const auth = await getSignedInBillingCompany();
    if (auth.ok) {
      redirect(companyCheckoutContinuePath(product));
    }
  }

  const plan = product ? PLAN_COPY[product] : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center section-pad py-12 sm:py-16">
      <div className="mb-8 text-center">
        <p className="font-display text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          doneunder.ai
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading">
          Create company account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {plan
            ? `Then continue to checkout for ${plan.name} (${plan.price}, excl. VAT).`
            : "Hiring teams create an account here, then choose a Search & Match plan."}
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/90 p-5 sm:p-6">
        {message ? (
          <p className="mb-4 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            {message}
          </p>
        ) : null}

        {!billingOn ? (
          <p className="text-sm text-muted-foreground">
            Online signup is not available in this environment yet.{" "}
            <Link href="/pricing" className="text-primary hover:underline">
              Back to pricing
            </Link>
            .
          </p>
        ) : !product ? (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>Pick a plan first so we can send you straight to checkout after signup.</p>
            <Link href="/pricing">
              <Button className="w-full" size="lg">
                Choose a plan
              </Button>
            </Link>
          </div>
        ) : (
          <form action={registerCompanyAction} className="space-y-4">
            <input type="hidden" name="product" value={product} />
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Company name</span>
              <input
                type="text"
                name="companyName"
                required
                autoComplete="organization"
                maxLength={120}
                className="w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
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
                maxLength={120}
                className="w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                placeholder="Alex Recruiter"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Work email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                placeholder="you@company.com"
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
                className="w-full rounded-lg border border-border/70 bg-surface-inset px-3 py-2.5 text-sm text-heading outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                placeholder="Min. 8 characters"
              />
            </label>
            <Button type="submit" className="h-11 w-full">
              Create account and pay
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Stripe collects billing address and VAT ID on the next step. No charge until you complete
              checkout.
            </p>
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have a company account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(product ? `/pricing` : "/pricing")}`}
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
