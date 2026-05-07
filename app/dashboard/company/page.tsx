import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { divers } from "@/lib/mock-data";
import { isStripeConfigured, isAiConfigured } from "@/lib/feature-flags";

export default function CompanyDashboardPage() {
  const billingEnabled = isStripeConfigured();
  const aiEnabled = isAiConfigured();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Company Dashboard (Paid)</h1>
      {!billingEnabled && (
        <p className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          Stripe is not configured yet. Billing actions are disabled to prevent checkout errors.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>AI Smart Job Poster</CardTitle>
            <CardDescription>Convert plain English requirements into complete post + top matches.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={!aiEnabled}>{aiEnabled ? "Draft Job with AI" : "AI Not Configured"}</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI Candidate Screener</CardTitle>
            <CardDescription>Natural language search across certifications, hours, and availability.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled={!aiEnabled}>
              {aiEnabled ? "Start Screening Chat" : "AI Not Configured"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Billing & Subscription</CardTitle>
            <CardDescription>Stripe-powered monthly plan management.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" disabled={!billingEnabled}>
              {billingEnabled ? "Manage Plan" : "Billing Coming Soon"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Demo Candidate Results</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          {divers.slice(0, 6).map((diver) => (
            <div key={diver.id} className="rounded-md border border-border p-3">
              <p className="font-medium">{diver.fullName}</p>
              <p className="text-muted-foreground">{diver.headline}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
