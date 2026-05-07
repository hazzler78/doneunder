import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isStripeConfigured } from "@/lib/feature-flags";

const plans = [
  { name: "Scout", price: "€149/mo", features: ["Search 250 profiles/mo", "3 active job posts", "AI screener chat"] },
  { name: "Operator", price: "€199/mo", features: ["Unlimited profile search", "10 active job posts", "Saved search alerts"] },
  { name: "Fleet", price: "€249/mo", features: ["Unlimited everything", "Priority support", "Team seats + audit logs"] },
];

export default function PricingPage() {
  const billingEnabled = isStripeConfigured();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold">Company Pricing</h1>
      {!billingEnabled && (
        <p className="mb-6 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          Billing is temporarily unavailable while Stripe setup is completed. You can still explore
          the platform.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-2xl font-bold">{plan.price}</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-cyan-300" />
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-cyan-200">Success fee (8-12% first contract): placeholder logic included.</p>
              <Button className="w-full" disabled={!billingEnabled}>
                {billingEnabled ? "Start Subscription" : "Billing Coming Soon"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
