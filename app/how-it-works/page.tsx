import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  "Divers create profiles, upload CV/certs, and publish ambassador links.",
  "Companies subscribe, search verified talent, and post urgent campaigns.",
  "AI helps generate job posts and shortlist candidates with explainable scores.",
  "Admin verification and moderation keep trust high across the marketplace.",
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">How doneunder.ai Works</h1>
      <div className="space-y-4">
        {steps.map((step, idx) => (
          <Card key={step}>
            <CardHeader>
              <CardTitle>Step {idx + 1}</CardTitle>
            </CardHeader>
            <CardContent>{step}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
