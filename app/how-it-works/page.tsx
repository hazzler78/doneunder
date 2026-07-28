import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PipelineVisual } from "@/components/landing/product-mockups";

const steps = [
  {
    id: "01",
    key: "find" as const,
    title: "Create your profile",
    body: "Divers upload CV and certificates. Hermes structures credentials for contractor-ready review.",
  },
  {
    id: "02",
    key: "prep" as const,
    title: "Publish and get discoverable",
    body: "Publish an ambassador page with verified signals — specialties, medicals, and mobilization notice.",
  },
  {
    id: "03",
    key: "match" as const,
    title: "Match to campaigns",
    body: "Companies search verified talent and post urgent scopes. AI shortlists with explainable scores.",
  },
  {
    id: "04",
    key: "mobilize" as const,
    title: "Mobilize with trust",
    body: "Admin verification and audit logs keep the marketplace high-trust for offshore hiring.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-6xl section-pad py-12 md:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">How it works</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-cyan-50 sm:text-4xl">
          From CV to campaign — one agent thread.
        </h1>
        <p className="mt-4 text-muted-foreground">
          doneunder.ai connects commercial divers and offshore contractors with verification-first
          matching and Hermes, your dedicated diving agent.
        </p>
      </div>

      <div className="mt-12 space-y-12">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`grid items-center gap-6 md:grid-cols-2 md:gap-10 ${
              index % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
            }`}
          >
            <div>
              <p className="font-mono text-xs text-primary/80">
                {step.id} · {step.key}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-cyan-50">{step.title}</h2>
              <p className="mt-3 text-muted-foreground">{step.body}</p>
            </div>
            <PipelineVisual step={step.key} />
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-col gap-3 sm:flex-row">
        <Link href="/register">
          <Button size="lg">Get started free</Button>
        </Link>
        <Link href="/pricing">
          <Button size="lg" variant="outline">
            Company plans
          </Button>
        </Link>
      </div>
    </div>
  );
}
