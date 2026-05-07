import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const plans = [
  { name: "Scout", price: "€149/mo", features: ["Search 250 profiles/mo", "3 active job posts", "AI screener chat"] },
  { name: "Operator", price: "€199/mo", features: ["Unlimited profile search", "10 active job posts", "Saved search alerts"] },
  { name: "Fleet", price: "€249/mo", features: ["Unlimited everything", "Priority support", "Team seats + audit logs"] },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold">Company Pricing</h1>
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
              <Button className="w-full">Start Subscription</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
