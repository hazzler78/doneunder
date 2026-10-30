import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BILLING_PRICES_USD, FAIR_USE, ONE_TIME_VALIDITY_DAYS } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/feature-flags";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing | doneunder.ai",
  description: `Search & Match for hiring teams: USD ${BILLING_PRICES_USD.one_time} per search or USD ${BILLING_PRICES_USD.monthly}/month unlimited. Divers use doneunder.ai free.`,
};

const NOTICES: Record<string, { tone: "info" | "error"; text: string }> = {
  cancelled: { tone: "info", text: "Checkout cancelled. You have not been charged." },
  error: { tone: "error", text: "We could not start checkout. Try again, or email us." },
};

const REASONS: Record<string, string> = {
  not_company: "Checkout needs a company account. Email us and we will set one up.",
  no_company_row: "Checkout needs a company account. Email us and we will set one up.",
  already_subscribed: "You already have Unlimited. Manage it from Search & Match → Manage billing.",
  unavailable: "Online payment is not switched on yet. Email us to get access.",
};

type Plan = {
  product: "one_time" | "monthly";
  name: string;
  price: string;
  cadence: string;
  points: string[];
  cta: string;
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    product: "one_time",
    name: "One search",
    price: `USD ${BILLING_PRICES_USD.one_time}`,
    cadence: "one-time",
    points: [
      "One Search & Match search: up to 10 anonymous matching divers with valid tickets",
      "Reveal one diver and open their full CV",
      `Use it within ${ONE_TIME_VALIDITY_DAYS} days of payment`,
      "Only used when the search returns matches",
    ],
    cta: "Buy one search",
  },
  {
    product: "monthly",
    name: "Unlimited",
    price: `USD ${BILLING_PRICES_USD.monthly}`,
    cadence: "per month",
    points: [
      "Unlimited Search & Match searches, one reveal per search",
      `Fair use: ${FAIR_USE.perHour} searches per hour, ${FAIR_USE.perDay} per day`,
      "Full CV access for every diver you reveal while subscribed",
      "Cancel anytime from Manage billing; access runs to the end of the paid month",
    ],
    cta: "Start Unlimited",
    featured: true,
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; reason?: string }>;
}) {
  const { billing, reason } = await searchParams;
  const billingOn = isStripeConfigured();
  const notice = billing ? NOTICES[billing] : undefined;
  const reasonText = reason ? REASONS[reason] : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl section-pad py-12 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Companies</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-heading sm:text-4xl">
          Find verified commercial divers.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Divers use doneunder.ai free. Hiring teams pay per search or go unlimited. Prices in US dollars, excl. VAT
          (VAT is added at checkout where it applies; EU businesses can enter a VAT ID for reverse charge).
        </p>
      </div>

      {notice || reasonText ? (
        <p
          className={`mx-auto mt-6 max-w-2xl rounded-md border p-3 text-center text-sm ${
            notice?.tone === "error" || (reasonText && !notice) ? "border-destructive/50 text-destructive" : "border-border"
          }`}
        >
          {reasonText ?? notice?.text}
        </p>
      ) : null}

      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.product}
            className={`flex flex-col rounded-2xl border p-6 ${plan.featured ? "border-primary" : "border-border/60"}`}
          >
            <h2 className="text-lg font-semibold text-heading">{plan.name}</h2>
            <p className="mt-2">
              <span className="font-display text-4xl font-semibold text-heading">{plan.price}</span>{" "}
              <span className="text-sm text-muted-foreground">{plan.cadence} · excl. VAT</span>
            </p>
            <ul className="mt-4 flex-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {plan.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {billingOn ? (
              <form action="/api/stripe/checkout" method="post" className="mt-6">
                <input type="hidden" name="product" value={plan.product} />
                <Button type="submit" size="lg" className="w-full" variant={plan.featured ? "default" : "outline"}>
                  {plan.cta}
                </Button>
              </form>
            ) : (
              <a href={CONTACT_MAILTO} className="mt-6">
                <Button size="lg" className="w-full" variant="outline">
                  Email {CONTACT_EMAIL}
                </Button>
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="mx-auto mt-8 max-w-2xl space-y-2 text-center text-sm text-muted-foreground">
        <p>
          You need a company account to buy. No account yet?{" "}
          <a href={CONTACT_MAILTO} className="text-primary hover:underline">
            Email {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Payments are processed by Stripe on behalf of 4 Days AI AB. Unlimited renews monthly until cancelled.
        </p>
        <p>
          <Link href="/register" className="text-primary hover:underline">
            I am a diver
          </Link>
        </p>
      </div>
    </div>
  );
}
