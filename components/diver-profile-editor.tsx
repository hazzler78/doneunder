"use client";

import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import type {
  DiverCertificationInput,
  DiverExperienceInput,
  DiverProfilePayload,
  DiverReferenceInput,
} from "@/lib/diver-profile";

type EditorData = {
  profile: Omit<DiverProfilePayload, "experiences" | "certifications" | "references">;
  experiences: DiverExperienceInput[];
  certifications: DiverCertificationInput[];
  references: DiverReferenceInput[];
};

type Props = {
  initialData: EditorData;
};

type AiProcessResponse = {
  ok: boolean;
  output: {
    professional_headline: string;
    polished_cv_markdown: string;
    polished_cv_json: {
      location?: string;
      mobilization_notice?: string;
      availability_status?: "available" | "deployed";
      sat_hours?: number;
      dive_hours?: number;
      experiences: DiverExperienceInput[];
      certifications: DiverCertificationInput[];
      references: Array<{
        name: string;
        company?: string;
        phone?: string;
        email?: string;
      }>;
    };
    ambassador_page: {
      public_headline: string;
      short_bio: string;
      key_highlights: string[];
    };
  };
};

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold">{title}</h2>;
}

function formatCvDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function buildPresentationCvMarkdown(form: EditorData, ambassadorShortBio: string, ambassadorHighlights: string[]) {
  const profile = form.profile;
  const lines: string[] = [];

  lines.push(`# ${profile.headline || "Commercial Diver CV"}`);
  lines.push("");
  lines.push(`**Location:** ${profile.location || "Not provided"}`);
  lines.push(`**Availability:** ${profile.availability_status === "available" ? "Available" : "Deployed"}`);
  lines.push(`**Mobilization:** ${profile.mobilization_notice || "Not provided"}`);
  lines.push(`**Sat Hours:** ${profile.sat_hours > 0 ? profile.sat_hours.toLocaleString() : "Not declared"}`);
  lines.push(`**Dive Hours:** ${profile.dive_hours > 0 ? profile.dive_hours.toLocaleString() : "Not declared"}`);
  lines.push("");
  lines.push("## Professional Summary");
  lines.push(ambassadorShortBio || profile.bio || "Not provided.");
  lines.push("");

  if (ambassadorHighlights.length > 0) {
    lines.push("## Key Highlights");
    ambassadorHighlights.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  lines.push("## Professional Experience");
  if (form.experiences.length === 0) {
    lines.push("- Not provided.");
  } else {
    form.experiences.forEach((exp) => {
      const dateStart = formatCvDate(exp.date_start);
      const dateEnd = formatCvDate(exp.date_end) ?? "Present";
      const dateRange = dateStart ? `${dateStart} - ${dateEnd}` : null;
      const headingParts = [exp.role_title, exp.company].filter(Boolean).join(" | ");
      lines.push(`- **${headingParts || "Experience"}**`);
      const meta = [exp.project_name, exp.location, dateRange].filter(Boolean).join(" • ");
      if (meta) lines.push(`  - ${meta}`);
      if (exp.summary) lines.push(`  - ${exp.summary}`);
    });
  }
  lines.push("");

  lines.push("## Certifications");
  if (form.certifications.length === 0) {
    lines.push("- Not provided.");
  } else {
    form.certifications.forEach((cert) => {
      const issue = formatCvDate(cert.issue_date) || "Not provided";
      const expiry = formatCvDate(cert.expiry_date) || "Not provided";
      const certId = cert.cert_number ? ` (#${cert.cert_number})` : "";
      lines.push(`- **${cert.name}${certId}** — Issued: ${issue}, Expires: ${expiry}`);
    });
  }
  lines.push("");

  lines.push("## References");
  if (form.references.length === 0) {
    lines.push("- Available on request.");
  } else {
    form.references.forEach((ref) => {
      const detail = [ref.company, ref.phone, ref.email].filter(Boolean).join(" • ");
      lines.push(`- **${ref.name}**${detail ? ` — ${detail}` : ""}`);
    });
  }

  return lines.join("\n");
}

export function DiverProfileEditor({ initialData }: Props) {
  const [form, setForm] = useState<EditorData>(initialData);
  const [mainCv, setMainCv] = useState<File | null>(null);
  const [certFiles, setCertFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<string>("");
  const [polishedCvMarkdown, setPolishedCvMarkdown] = useState(initialData.profile.polished_cv_markdown ?? "");
  const [polishedCvJson, setPolishedCvJson] = useState<Record<string, unknown> | null>(initialData.profile.polished_cv_json ?? null);
  const [ambassadorPublicHeadline, setAmbassadorPublicHeadline] = useState(initialData.profile.ambassador_public_headline ?? "");
  const [ambassadorShortBio, setAmbassadorShortBio] = useState(initialData.profile.ambassador_short_bio ?? "");
  const [ambassadorHighlights, setAmbassadorHighlights] = useState<string[]>(
    initialData.profile.ambassador_key_highlights ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showFullEditor, setShowFullEditor] = useState(false);
  const mainCvInputRef = useRef<HTMLInputElement | null>(null);
  const certInputRef = useRef<HTMLInputElement | null>(null);

  const actionRequiredCerts = useMemo(
    () => form.certifications.filter((cert) => !cert.expiry_date),
    [form.certifications],
  );
  const cvChecklist = useMemo(() => {
    const checks = [
      { label: "Headline is filled", ok: Boolean(form.profile.headline.trim()) },
      { label: "Professional summary is filled", ok: Boolean((ambassadorShortBio || form.profile.bio).trim()) },
      { label: "Location is filled", ok: Boolean(form.profile.location.trim()) },
      { label: "Mobilization notice is filled", ok: Boolean(form.profile.mobilization_notice.trim()) },
      { label: "At least 1 experience added", ok: form.experiences.length > 0 },
      { label: "At least 1 certification added", ok: form.certifications.length > 0 },
      {
        label: "All certifications have expiry dates",
        ok: form.certifications.length > 0 && form.certifications.every((cert) => Boolean(cert.expiry_date?.trim())),
      },
      { label: "At least 1 reference added", ok: form.references.length > 0 },
    ];
    const passed = checks.filter((item) => item.ok).length;
    const score = Math.round((passed / checks.length) * 100);
    return { checks, score };
  }, [form, ambassadorShortBio]);
  const presentationCvMarkdown = useMemo(
    () => buildPresentationCvMarkdown(form, ambassadorShortBio, ambassadorHighlights),
    [form, ambassadorShortBio, ambassadorHighlights],
  );

  function applyQuickFixes() {
    setForm((prev) => {
      const next = { ...prev };

      if (!next.profile.headline.trim()) {
        next.profile = { ...next.profile, headline: "Commercial Diver | Offshore Projects" };
      }
      if (!next.profile.location.trim()) {
        next.profile = { ...next.profile, location: "Not provided" };
      }
      if (!next.profile.mobilization_notice.trim()) {
        next.profile = { ...next.profile, mobilization_notice: "Available on short notice" };
      }
      if (next.experiences.length === 0) {
        next.experiences = [{ company: "Not provided", role_title: "Commercial Diver", summary: "Project details to be added.", source: "manual" }];
      }
      if (next.certifications.length === 0) {
        next.certifications = [{ name: "Not provided", expiry_date: "2030-12-31", source: "manual" }];
      } else {
        next.certifications = next.certifications.map((cert) => ({
          ...cert,
          expiry_date: cert.expiry_date?.trim() ? cert.expiry_date : "2030-12-31",
        }));
      }
      if (next.references.length === 0) {
        next.references = [{ name: "Reference available on request", phone: "Not provided", source: "manual" }];
      }
      if (!(ambassadorShortBio || next.profile.bio).trim()) {
        setAmbassadorShortBio("Experienced commercial diver available for offshore and onshore assignments.");
      }
      return next;
    });

    if (ambassadorHighlights.length === 0) {
      setAmbassadorHighlights([
        "Offshore commercial diving experience",
        "Ready for short-notice mobilization",
        "Safety-focused project delivery",
      ]);
    }
  }

  function onCertFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    setCertFiles((prev) => [...prev, ...Array.from(fileList)]);
  }

  function onCertificateDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    onCertFilesSelected(event.dataTransfer.files);
  }

  async function onProcessWithAi() {
    if (!mainCv) {
      setMessage("Upload a main CV PDF first.");
      return;
    }
    setProcessing(true);
    setProcessingProgress(10);
    setProcessingStage("Uploading files...");
    setMessage(null);

    const payload = new FormData();
    payload.append("mainCv", mainCv);
    certFiles.forEach((file) => payload.append("certificates", file));

    const response = await fetch("/api/diver/profile/process-cv", {
      method: "POST",
      body: payload,
    });

    setProcessingProgress(85);
    setProcessingStage("Applying AI output to your profile...");
    setProcessing(false);
    setProcessingProgress(100);
    setProcessingStage("Done");
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Failed to process CV." }));
      setMessage(data.error ?? "Failed to process CV.");
      return;
    }

    const data = (await response.json()) as AiProcessResponse;
    const profile = data.output.polished_cv_json;

    setForm((prev) => ({
      profile: {
        ...prev.profile,
        headline: data.output.professional_headline,
        bio: data.output.ambassador_page.short_bio,
        location: profile.location ?? prev.profile.location,
        mobilization_notice: profile.mobilization_notice ?? prev.profile.mobilization_notice,
        availability_status: profile.availability_status ?? prev.profile.availability_status,
        sat_hours: profile.sat_hours ?? prev.profile.sat_hours,
        dive_hours: profile.dive_hours ?? prev.profile.dive_hours,
        headline_source: "ai",
        bio_source: "ai",
      },
      experiences: profile.experiences.map((item) => ({ ...item, source: "ai" })),
      certifications: profile.certifications.map((item) => ({ ...item, source: "ai" })),
      references: profile.references.map((item) => ({
        name: item.name,
        company: item.company,
        phone: item.phone ?? "Not provided",
        email: item.email,
        source: "ai",
      })),
    }));

    setPolishedCvMarkdown(data.output.polished_cv_markdown);
    setPolishedCvJson(data.output.polished_cv_json as Record<string, unknown>);
    setAmbassadorPublicHeadline(data.output.ambassador_page.public_headline);
    setAmbassadorShortBio(data.output.ambassador_page.short_bio);
    setAmbassadorHighlights(data.output.ambassador_page.key_highlights);
    setShowFullEditor(true);
    setMessage("AI finished. Review the preview, verify details, and click Save profile.");
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/diver/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        profile: {
          ...form.profile,
          polished_cv_markdown: presentationCvMarkdown,
          polished_cv_json: polishedCvJson,
          ambassador_public_headline: ambassadorPublicHeadline,
          ambassador_short_bio: ambassadorShortBio,
          ambassador_key_highlights: ambassadorHighlights,
        },
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("Save failed. Please check required fields and try again.");
      return;
    }
    setMessage("Profile saved.");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border p-4">
        <SectionTitle title="Upload & Improve Your CV" />
        <p className="text-xs text-muted-foreground">Upload CV, click Process with AI, then Save profile.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Main CV (PDF)</span>
            <input
              ref={mainCvInputRef}
              type="file"
              accept="application/pdf"
              onChange={(event) => setMainCv(event.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => mainCvInputRef.current?.click()}>
                Start here
              </Button>
              <span className="text-xs text-cyan-200">{mainCv?.name ?? "No CV selected"}</span>
            </div>
          </div>
          <div
            className="space-y-2 rounded-md border border-dashed p-4 sm:p-3"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onCertificateDrop}
          >
            <p className="text-xs text-muted-foreground">
              Certificates (PDF/JPG/PNG). Drag-and-drop here or choose files.
            </p>
            <input
              ref={certInputRef}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => onCertFilesSelected(event.target.files)}
              className="hidden"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => certInputRef.current?.click()}>
              Continue here
            </Button>
            {certFiles.length > 0 ? (
              <div className="space-y-1 text-xs text-cyan-200">
                {certFiles.map((file, index) => (
                  <p key={`${file.name}-${index}`}>{file.name}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <Button
          onClick={onProcessWithAi}
          disabled={processing || !mainCv}
          className="w-full sm:w-auto disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-400"
        >
          {processing ? "Processing..." : "Process with AI"}
        </Button>
        {!showFullEditor ? (
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowFullEditor(true)}>
            Open editor
          </Button>
        ) : null}
        {processing || processingProgress > 0 ? (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-cyan-400 transition-all duration-500"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {processing ? processingStage || "Processing..." : processingStage}
            </p>
          </div>
        ) : null}
      </section>

      {showFullEditor ? (
        <>
      <section className="space-y-3 rounded-lg border p-4">
        <SectionTitle title="Core Profile" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Headline</span>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={form.profile.headline}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, profile: { ...prev.profile, headline: event.target.value } }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Location</span>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={form.profile.location}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, profile: { ...prev.profile, location: event.target.value } }))
              }
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">Professional Summary</span>
            <textarea
              className="min-h-28 w-full rounded-md border bg-transparent p-2"
              value={form.profile.bio}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, profile: { ...prev.profile, bio: event.target.value } }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Availability</span>
            <select
              className="w-full rounded-md border bg-transparent p-2"
              value={form.profile.availability_status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  profile: {
                    ...prev.profile,
                    availability_status: event.target.value as "available" | "deployed",
                  },
                }))
              }
            >
              <option value="available">Available</option>
              <option value="deployed">Deployed</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Mobilization Notice</span>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={form.profile.mobilization_notice}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, mobilization_notice: event.target.value },
                }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Saturation Hours</span>
            <input
              type="number"
              min={0}
              className="w-full rounded-md border bg-transparent p-2"
              value={form.profile.sat_hours}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, sat_hours: Number(event.target.value || 0) },
                }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Total Dive Hours</span>
            <input
              type="number"
              min={0}
              className="w-full rounded-md border bg-transparent p-2"
              value={form.profile.dive_hours}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  profile: { ...prev.profile, dive_hours: Number(event.target.value || 0) },
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <SectionTitle title="CV Preview" />
        <p className="text-xs text-amber-300">
          Presentation-ready CV generated from your profile data. Minimal editing needed before saving.
        </p>
        <div className="rounded-md border border-cyan-900/60 bg-cyan-950/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-cyan-100">CV quality score: {cvChecklist.score}%</p>
            <Button size="sm" variant="secondary" onClick={applyQuickFixes}>
              Auto-fill missing basics
            </Button>
          </div>
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {cvChecklist.checks.map((item) => (
              <li key={item.label} className={item.ok ? "text-emerald-300" : "text-amber-300"}>
                {item.ok ? "✓" : "•"} {item.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="max-h-96 overflow-y-auto rounded-md border bg-[#071725] p-4 text-sm">
          {presentationCvMarkdown.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-semibold text-cyan-100">{children}</h1>,
                h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-semibold text-cyan-100">{children}</h2>,
                h3: ({ children }) => <h3 className="mb-2 mt-3 text-base font-semibold text-cyan-100">{children}</h3>,
                p: ({ children }) => <p className="mb-3 leading-relaxed text-slate-100">{children}</p>,
                ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-slate-100">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-slate-100">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-cyan-100">{children}</strong>,
                em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
                code: ({ children }) => (
                  <code className="rounded bg-slate-900/80 px-1 py-0.5 font-mono text-xs text-cyan-200">
                    {children}
                  </code>
                ),
                img: () => null,
              }}
            >
              {presentationCvMarkdown}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">Your polished CV will appear here after AI processing.</p>
          )}
        </div>
        <details className="rounded-md border border-dashed p-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Advanced only: raw AI markdown
          </summary>
          <textarea
            className="mt-3 min-h-72 w-full rounded-md border bg-transparent p-2 font-mono text-sm"
            value={polishedCvMarkdown}
            onChange={(event) => setPolishedCvMarkdown(event.target.value)}
            placeholder="Raw AI markdown appears here."
          />
        </details>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <SectionTitle title="Ambassador Page Preview" />
        <p className="text-xs text-amber-300">This public view may contain AI-generated text. Verify before publishing.</p>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Public headline</span>
          <input
            className="w-full rounded-md border bg-transparent p-2"
            value={ambassadorPublicHeadline}
            onChange={(event) => setAmbassadorPublicHeadline(event.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Short bio</span>
          <textarea
            className="min-h-24 w-full rounded-md border bg-transparent p-2"
            value={ambassadorShortBio}
            onChange={(event) => setAmbassadorShortBio(event.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Key highlights (one per line)</span>
          <textarea
            className="min-h-20 w-full rounded-md border bg-transparent p-2"
            value={ambassadorHighlights.join("\n")}
            onChange={(event) =>
              setAmbassadorHighlights(
                event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <SectionTitle title="Professional Experience" />
          <Button
            variant="outline"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                experiences: [...prev.experiences, { company: "", role_title: "", source: "manual" }],
              }))
            }
          >
            Add experience
          </Button>
        </div>
        <div className="space-y-3">
          {form.experiences.map((experience, index) => (
            <div key={experience.id ?? `experience-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-2">
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Company"
                value={experience.company}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.experiences];
                    updated[index] = { ...updated[index], company: event.target.value };
                    return { ...prev, experiences: updated };
                  })
                }
              />
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Role"
                value={experience.role_title}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.experiences];
                    updated[index] = { ...updated[index], role_title: event.target.value };
                    return { ...prev, experiences: updated };
                  })
                }
              />
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Project (optional)"
                value={experience.project_name ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.experiences];
                    updated[index] = { ...updated[index], project_name: event.target.value };
                    return { ...prev, experiences: updated };
                  })
                }
              />
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Location (optional)"
                value={experience.location ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.experiences];
                    updated[index] = { ...updated[index], location: event.target.value };
                    return { ...prev, experiences: updated };
                  })
                }
              />
              <input
                type="date"
                className="rounded-md border bg-transparent p-2"
                value={experience.date_start ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.experiences];
                    updated[index] = { ...updated[index], date_start: event.target.value };
                    return { ...prev, experiences: updated };
                  })
                }
              />
              <input
                type="date"
                className="rounded-md border bg-transparent p-2"
                value={experience.date_end ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.experiences];
                    updated[index] = { ...updated[index], date_end: event.target.value };
                    return { ...prev, experiences: updated };
                  })
                }
              />
              <textarea
                className="min-h-20 rounded-md border bg-transparent p-2 md:col-span-2"
                placeholder="Scope summary"
                value={experience.summary ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.experiences];
                    updated[index] = { ...updated[index], summary: event.target.value };
                    return { ...prev, experiences: updated };
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <SectionTitle title="Certifications" />
          <Button
            variant="outline"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                certifications: [...prev.certifications, { name: "", source: "manual" }],
              }))
            }
          >
            Add certification
          </Button>
        </div>
        <div className="space-y-3">
          {form.certifications.map((certification, index) => (
            <div key={certification.id ?? `cert-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
              <input
                className="rounded-md border bg-transparent p-2 md:col-span-3"
                placeholder="Certification name"
                value={certification.name}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.certifications];
                    updated[index] = { ...updated[index], name: event.target.value };
                    return { ...prev, certifications: updated };
                  })
                }
              />
              <input
                type="date"
                className="rounded-md border bg-transparent p-2"
                value={certification.issue_date ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.certifications];
                    updated[index] = { ...updated[index], issue_date: event.target.value };
                    return { ...prev, certifications: updated };
                  })
                }
              />
              <input
                type="date"
                className="rounded-md border bg-transparent p-2"
                value={certification.expiry_date ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.certifications];
                    updated[index] = { ...updated[index], expiry_date: event.target.value };
                    return { ...prev, certifications: updated };
                  })
                }
              />
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Cert number"
                value={certification.cert_number ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.certifications];
                    updated[index] = { ...updated[index], cert_number: event.target.value };
                    return { ...prev, certifications: updated };
                  })
                }
              />
            </div>
          ))}
        </div>
        {actionRequiredCerts.length > 0 ? (
          <p className="text-xs text-amber-300">
            Action required: {actionRequiredCerts.map((cert) => cert.name || "Unnamed certification").join(", ")} missing
            expiry date.
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <SectionTitle title="References" />
          <Button
            variant="outline"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                references: [...prev.references, { name: "", phone: "", source: "manual" }],
              }))
            }
          >
            Add reference
          </Button>
        </div>
        <div className="space-y-3">
          {form.references.map((reference, index) => (
            <div key={reference.id ?? `reference-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-2">
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Name"
                value={reference.name}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.references];
                    updated[index] = { ...updated[index], name: event.target.value };
                    return { ...prev, references: updated };
                  })
                }
              />
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Company (optional)"
                value={reference.company ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.references];
                    updated[index] = { ...updated[index], company: event.target.value };
                    return { ...prev, references: updated };
                  })
                }
              />
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Phone"
                value={reference.phone}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.references];
                    updated[index] = { ...updated[index], phone: event.target.value };
                    return { ...prev, references: updated };
                  })
                }
              />
              <input
                className="rounded-md border bg-transparent p-2"
                placeholder="Email (optional)"
                value={reference.email ?? ""}
                onChange={(event) =>
                  setForm((prev) => {
                    const updated = [...prev.references];
                    updated[index] = { ...updated[index], email: event.target.value };
                    return { ...prev, references: updated };
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
        {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
      </div>
        </>
      ) : null}
    </div>
  );
}
