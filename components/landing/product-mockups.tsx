import type { ReactNode } from "react";
import { divers, jobs } from "@/lib/mock-data";

export function HeroProductMockup() {
  const topJobs = jobs.slice(0, 3);
  const diver = divers[0];

  return (
    <div className="product-frame relative overflow-hidden rounded-2xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse-soft" />
          <span className="text-xs font-medium text-cyan-100/90">Hermes · Online</span>
        </div>
        <span className="text-[11px] text-muted-foreground">Workspace</span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3 border-b border-border/50 p-4 lg:border-b-0 lg:border-r">
          <div className="max-w-[90%] rounded-xl border border-border/60 bg-[#061018] px-3 py-2.5 text-sm text-muted-foreground">
            Review my CV and find offshore roles that fit my certs.
          </div>
          <div className="max-w-[95%] space-y-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary/80">Hermes</p>
            <p className="text-cyan-50/95">
              Profile looks strong for IRM and sat-support. IMCA + DMT + BOSIET are current. Three
              campaigns match your mobilization window.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Review profile", "Find matches", "Publish page"].map((label) => (
              <span
                key={label}
                className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-cyan-100/80"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative space-y-2.5 p-4">
          <div className="pointer-events-none absolute inset-x-4 top-4 h-16 overflow-hidden opacity-30">
            <div className="h-8 w-full bg-gradient-to-b from-primary/30 to-transparent animate-scan" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-cyan-100">Top matches</p>
            <p className="text-[11px] text-muted-foreground">Live</p>
          </div>
          {topJobs.map((job, index) => (
            <div
              key={job.id}
              className="rounded-lg border border-border/60 bg-[#050f18]/90 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-cyan-50">{job.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {job.location} · starts {job.startDate}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                  {94 - index * 7}%
                </span>
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
            Ready for {diver.fullName.split(" ")[0]} · {diver.mobilizationNotice}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PipelineVisual({
  step,
  children,
}: {
  step: "find" | "prep" | "match" | "mobilize";
  children?: ReactNode;
}) {
  if (step === "find") {
    return (
      <div className="product-frame relative overflow-hidden rounded-xl p-4 font-mono text-[11px] leading-relaxed text-cyan-100/70">
        <p className="text-muted-foreground">[scanning campaigns…]</p>
        <p>North Sea IRM · sat welder package · +1 new</p>
        <p>Baltic tie-in · ADCI + BOSIET · 0 new</p>
        <p className="text-success">Offshore wind inspection · NDT · match</p>
        {children}
      </div>
    );
  }

  if (step === "prep") {
    return (
      <div className="product-frame space-y-2 rounded-xl p-4 text-sm">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Profile delta</p>
        <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-red-200/90 line-through decoration-red-300/40">
          Commercial diver seeking work
        </p>
        <p className="rounded-md bg-success/10 px-2 py-1.5 text-success">
          Offshore Commercial Diver & DMT · IMCA ready · short-notice mobilizations
        </p>
        {children}
      </div>
    );
  }

  if (step === "match") {
    return (
      <div className="product-frame space-y-2 rounded-xl p-4">
        {jobs.slice(0, 2).map((job, i) => (
          <div key={job.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-cyan-50">{job.title}</p>
              <p className="text-[11px] text-muted-foreground">{job.location}</p>
            </div>
            <span className="text-xs font-semibold text-primary">{91 - i * 5}%</span>
          </div>
        ))}
        {children}
      </div>
    );
  }

  return (
    <div className="product-frame space-y-3 rounded-xl p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-cyan-50">Mobilization checklist</span>
        <span className="text-[11px] text-success">3/4 ready</span>
      </div>
      {["Medical current", "BOSIET valid", "CV published", "Travel docs"].map((item, i) => (
        <div key={item} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{item}</span>
          <span className={i < 3 ? "text-success" : "text-warning"}>{i < 3 ? "Ready" : "Pending"}</span>
        </div>
      ))}
      {children}
    </div>
  );
}

export function AgentChatMockup() {
  return (
    <div className="product-frame overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          H
        </span>
        <div>
          <p className="text-sm font-medium text-cyan-50">Hermes</p>
          <p className="text-[11px] text-muted-foreground">Your commercial diving agent</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[#0d3a4a] px-3.5 py-2.5 text-sm text-cyan-50">
          Can you tighten my headline for offshore wind?
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-border/60 bg-[#061018] px-3.5 py-2.5 text-sm text-cyan-50/95">
          Done. New headline emphasizes NDT + monopile inspection. Want me to publish your ambassador
          page next?
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Suggestion</p>
          <p className="text-sm font-medium text-cyan-50">Offshore Wind Inspection Team</p>
          <p className="text-xs text-muted-foreground">North Sea · 88% match · starts 2026-07-04</p>
        </div>
      </div>
    </div>
  );
}
