import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { divers } from "@/lib/mock-data";

export default function CompanyDashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Company Dashboard (Paid)</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>AI Smart Job Poster</CardTitle>
            <CardDescription>Convert plain English requirements into complete post + top matches.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button>Draft Job with AI</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI Candidate Screener</CardTitle>
            <CardDescription>Natural language search across certifications, hours, and availability.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline">Start Screening Chat</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Billing & Subscription</CardTitle>
            <CardDescription>Stripe-powered monthly plan management.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary">Manage Plan</Button>
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
