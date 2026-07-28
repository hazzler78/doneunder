import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStripeConfigured } from "@/lib/feature-flags";

const plans = [
  {
    name: "Scout",
    price: "€149",
    features: ["Search 250 profiles/mo", "3 active job posts", "AI screener chat"],
  },
  {
    name: "Operator",
    price: "€199",
    features: ["Unlimited profile search", "10 active job posts", "Saved search alerts"],
    highlighted: true,
  },
  {
    name: "Fleet",
    price: "€249",
    features: ["Unlimited everything", "Priority support", "Team seats + audit logs"],
  },
];

export default function PricingPage() {
  const billingEnabled = isStripeConfigured();

  return (
    <div className="mx-auto w-full max-w-6xl section-pad py-12 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Pricing</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-cyan-50 sm:text-4xl">
          Company plans for serious hiring teams.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Divers use doneunder.ai free. Companies subscribe for search, campaigns, and AI screening.
        </p>
      </div>

      {!billingEnabled ? (
        <p className="mx-auto mt-8 max-w-2xl rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100">
          Billing is temporarily unavailable while Stripe setup is completed. You can still explore
          the platform.
        </p>
      ) : null}

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl border p-6 ${
              plan.highlighted
                ? "border-primary/40 bg-[#071522]"
                : "border-border/60 bg-[#060e18]/80"
            }`}
          >
            <p className="font-display text-lg font-semibold text-cyan-50">{plan.name}</p>
            <p className="mt-3 font-display text-3xl font-semibold text-cyan-50">
              {plan.price}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-primary/80">
              Success fee (8–12% first contract): placeholder logic included.
            </p>
            <Button className="mt-6 w-full" disabled={!billingEnabled}>
              {billingEnabled ? "Start subscription" : "Billing coming soon"}
            </Button>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Looking for a diver account?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Create one free
        </Link>
      </p>
    </div>
  );
}
