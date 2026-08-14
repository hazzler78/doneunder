"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  initialProfileStatus?: "draft" | "published";
  initialPublishedAt?: string | null;
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

function isMissingValue(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized === "not provided" || normalized === "not declared";
}

function fieldClass(isMissing: boolean, extra?: string) {
  return cn(
    "w-full rounded-md border bg-transparent p-2",
    isMissing && "border-amber-500/70 bg-amber-500/10 text-amber-100",
    extra,
  );
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

function buildEditorFingerprint(input: {
  form: EditorData;
  polishedCvMarkdown: string;
  polishedCvJson: Record<string, unknown> | null;
  ambassadorPublicHeadline: string;
  ambassadorShortBio: string;
  ambassadorHighlights: string[];
}) {
  return JSON.stringify(input);
}

export function DiverProfileEditor({
  initialData,
  initialProfileStatus = "draft",
  initialPublishedAt = null,
}: Props) {
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
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(() =>
    buildEditorFingerprint({
      form: initialData,
      polishedCvMarkdown: initialData.profile.polished_cv_markdown ?? "",
      polishedCvJson: (initialData.profile.polished_cv_json as Record<string, unknown> | null) ?? null,
      ambassadorPublicHeadline: initialData.profile.ambassador_public_headline ?? "",
      ambassadorShortBio: initialData.profile.ambassador_short_bio ?? "",
      ambassadorHighlights: initialData.profile.ambassador_key_highlights ?? [],
    }),
  );
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [profileStatus, setProfileStatus] = useState(initialProfileStatus);
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt);
  const [message, setMessage] = useState<string | null>(null);
  const [showFullEditor, setShowFullEditor] = useState(
    () =>
      Boolean(
        initialData.profile.headline.trim() ||
          initialData.profile.bio.trim() ||
          initialData.profile.ambassador_public_headline?.trim() ||
          initialData.experiences.length ||
          initialData.certifications.length,
      ),
  );
  const mainCvInputRef = useRef<HTMLInputElement | null>(null);
  const certInputRef = useRef<HTMLInputElement | null>(null);
  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingStartRef = useRef<number>(0);

  const actionRequiredCerts = useMemo(
    () => form.certifications.filter((cert) => !cert.expiry_date),
    [form.certifications],
  );
  const cvChecklist = useMemo(() => {
    const checks = [
      { label: "Headline is filled", ok: !isMissingValue(form.profile.headline) },
      { label: "Professional summary is filled", ok: !isMissingValue(ambassadorShortBio || form.profile.bio) },
      { label: "Location is filled", ok: !isMissingValue(form.profile.location) },
      { label: "Mobilization notice is filled", ok: !isMissingValue(form.profile.mobilization_notice) },
      {
        label: "At least 1 complete experience added",
        ok: form.experiences.some((exp) => !isMissingValue(exp.company) && !isMissingValue(exp.role_title)),
      },
      {
        label: "At least 1 certification added",
        ok: form.certifications.some((cert) => !isMissingValue(cert.name)),
      },
      {
        label: "All certifications have expiry dates",
        ok:
          form.certifications.some((cert) => !isMissingValue(cert.name)) &&
          form.certifications
            .filter((cert) => !isMissingValue(cert.name))
            .every((cert) => Boolean(cert.expiry_date?.trim()) && !isMissingValue(cert.expiry_date)),
      },
      {
        label: "At least 1 reference with contact added",
        ok: form.references.some((ref) => !isMissingValue(ref.name) && (!isMissingValue(ref.phone) || !isMissingValue(ref.email))),
      },
    ];
    const passed = checks.filter((item) => item.ok).length;
    const score = Math.round((passed / checks.length) * 100);
    return { checks, score };
  }, [form, ambassadorShortBio]);
  const presentationCvMarkdown = useMemo(
    () => buildPresentationCvMarkdown(form, ambassadorShortBio, ambassadorHighlights),
    [form, ambassadorShortBio, ambassadorHighlights],
  );
  const editorFingerprint = useMemo(
    () =>
      buildEditorFingerprint({
        form,
        polishedCvMarkdown,
        polishedCvJson,
        ambassadorPublicHeadline,
        ambassadorShortBio,
        ambassadorHighlights,
      }),
    [
      form,
      polishedCvMarkdown,
      polishedCvJson,
      ambassadorPublicHeadline,
      ambassadorShortBio,
      ambassadorHighlights,
    ],
  );
  const hasUnsavedChanges = editorFingerprint !== lastSavedFingerprint;
  const missingSummary = useMemo(() => {
    const missing = [
      isMissingValue(form.profile.headline) ? "Headline" : null,
      isMissingValue(form.profile.bio) ? "Professional summary" : null,
      isMissingValue(form.profile.location) ? "Location" : null,
      isMissingValue(form.profile.mobilization_notice) ? "Mobilization notice" : null,
      form.experiences.some((exp) => isMissingValue(exp.company) || isMissingValue(exp.role_title))
        ? "Experience entries"
        : null,
      form.certifications.some((cert) => isMissingValue(cert.name) || isMissingValue(cert.expiry_date))
        ? "Certification details"
        : null,
      form.references.some((ref) => isMissingValue(ref.name) || isMissingValue(ref.phone))
        ? "Reference details"
        : null,
    ].filter((item): item is string => Boolean(item));
    return missing;
  }, [form]);

  const missingSectionTargets: Record<string, string> = {
    Headline: "core-profile",
    "Professional summary": "core-profile",
    Location: "core-profile",
    "Mobilization notice": "core-profile",
    "Experience entries": "professional-experience",
    "Certification details": "certifications",
    "Reference details": "references",
  };

  useEffect(() => {
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const onDocumentClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const destination = new URL(anchor.href, window.location.origin);
      const current = new URL(window.location.href);
      const isSamePath =
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash;
      if (isSamePath) return;

      const confirmed = window.confirm(
        "You have unsaved CV changes. Leave this page and lose those edits?",
      );
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, [hasUnsavedChanges]);

  function startProcessingProgress() {
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
    }
    processingStartRef.current = Date.now();
    setProcessingProgress(2);
    setProcessingStage("Uploading files...");

    processingIntervalRef.current = setInterval(() => {
      const elapsedSeconds = (Date.now() - processingStartRef.current) / 1000;
      setProcessingProgress((prev) => {
        if (prev >= 94) return prev;

        let increment = 0.5;
        if (elapsedSeconds < 8) increment = 4;
        else if (elapsedSeconds < 25) increment = 2;
        else if (elapsedSeconds < 55) increment = 1.1;
        else if (elapsedSeconds < 80) increment = 0.7;

        return Math.min(94, Number((prev + increment).toFixed(1)));
      });

      if (elapsedSeconds < 10) {
        setProcessingStage("Uploading files...");
      } else if (elapsedSeconds < 30) {
        setProcessingStage("Extracting CV and certificate text...");
      } else if (elapsedSeconds < 60) {
        setProcessingStage("Generating polished CV with AI...");
      } else {
        setProcessingStage("Finalizing profile details...");
      }
    }, 1000);
  }

  function finishProcessingProgress() {
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
      processingIntervalRef.current = null;
    }
    setProcessingProgress(100);
    setProcessingStage("Done");
  }

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

  function jumpToSection(sectionId: string) {
    setShowFullEditor(true);
    requestAnimationFrame(() => {
      const target = document.getElementById(sectionId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
    if (!mainCv && certFiles.length === 0) {
      setMessage("Select certificate files, or a new CV PDF if you want to replace the current one.");
      return;
    }
    if (hasUnsavedChanges) {
      const shouldSaveFirst = window.confirm(
        "You have unsaved CV edits. Click OK to save your changes first, then continue with AI processing.",
      );
      if (!shouldSaveFirst) {
        setMessage("Processing cancelled. Save profile first to keep your manual changes.");
        return;
      }
      const saveOk = await saveProfile(false);
      if (!saveOk) {
        setMessage("Could not save your edits, so AI processing was stopped to protect your changes.");
        return;
      }
    }
    setProcessing(true);
    startProcessingProgress();
    setMessage(null);

    const payload = new FormData();
    if (mainCv) payload.append("mainCv", mainCv);
    certFiles.forEach((file) => payload.append("certificates", file));

    const response = await fetch("/api/diver/profile/process-cv", {
      method: "POST",
      body: payload,
    });

    setProcessing(false);
    finishProcessingProgress();
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
    const nextFingerprint = buildEditorFingerprint({
      form: {
        profile: {
          ...form.profile,
          headline: data.output.professional_headline,
          bio: data.output.ambassador_page.short_bio,
          location: profile.location ?? form.profile.location,
          mobilization_notice: profile.mobilization_notice ?? form.profile.mobilization_notice,
          availability_status: profile.availability_status ?? form.profile.availability_status,
          sat_hours: profile.sat_hours ?? form.profile.sat_hours,
          dive_hours: profile.dive_hours ?? form.profile.dive_hours,
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
      },
      polishedCvMarkdown: data.output.polished_cv_markdown,
      polishedCvJson: data.output.polished_cv_json as Record<string, unknown>,
      ambassadorPublicHeadline: data.output.ambassador_page.public_headline,
      ambassadorShortBio: data.output.ambassador_page.short_bio,
      ambassadorHighlights: data.output.ambassador_page.key_highlights,
    });
    setLastSavedFingerprint(nextFingerprint);
    setShowFullEditor(true);
    setMessage("AI finished. Review the preview, verify details, and click Save profile.");
  }

  async function saveProfile(showSuccessMessage: boolean) {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/diver/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form.profile,
        experiences: form.experiences,
        certifications: form.certifications,
        references: form.references,
        polished_cv_markdown: presentationCvMarkdown,
        polished_cv_json: polishedCvJson,
        ambassador_public_headline: ambassadorPublicHeadline,
        ambassador_short_bio: ambassadorShortBio,
        ambassador_key_highlights: ambassadorHighlights,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("Save failed. Please check required fields and try again.");
      return false;
    }
    setLastSavedFingerprint(editorFingerprint);
    if (showSuccessMessage) {
      setMessage("Profile saved.");
    }
    return true;
  }

  async function onSave() {
    await saveProfile(true);
  }

  async function onPublish() {
    setPublishing(true);
    setMessage(null);

    const saved = await saveProfile(false);
    if (!saved) {
      setPublishing(false);
      setMessage("Could not publish. Save your profile first and ensure Headline is filled in.");
      return;
    }

    const response = await fetch("/api/diver/profile/publish", { method: "POST" });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      validation?: { errors: string[]; warnings: string[] };
    };

    setPublishing(false);

    if (!response.ok) {
      const details = data.validation?.errors?.join(" ") ?? "";
      setMessage(`${data.error ?? "Publish failed."}${details ? ` ${details}` : ""}`);
      return;
    }

    setProfileStatus("published");
    setPublishedAt(new Date().toISOString());
    setMessage("Profile published. Your ambassador page is now publicly visible.");
  }

  return (
    <div className="space-y-6">
      <section id="core-profile" className="space-y-3 rounded-lg border p-4">
        <SectionTitle title="Upload & Improve Your CV" />
        <p className="text-xs text-muted-foreground">
          Your CV stays on file. Add certificates alone, or optionally replace the CV PDF.
        </p>
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
          disabled={processing || (!mainCv && certFiles.length === 0)}
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
        {missingSummary.length > 0 ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            Needs review: {missingSummary.join(", ")}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Headline</span>
            <input
              className={fieldClass(isMissingValue(form.profile.headline))}
              value={form.profile.headline}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, profile: { ...prev.profile, headline: event.target.value } }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Location</span>
            <input
              className={fieldClass(isMissingValue(form.profile.location))}
              value={form.profile.location}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, profile: { ...prev.profile, location: event.target.value } }))
              }
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">Professional Summary</span>
            <textarea
              className={fieldClass(isMissingValue(form.profile.bio), "min-h-28")}
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
              className={fieldClass(isMissingValue(form.profile.mobilization_notice))}
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
          {missingSummary.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
              <p className="text-xs text-amber-200">
                Missing in preview. Click to jump directly to edit:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingSummary.map((item) => (
                  <Button
                    key={`missing-preview-${item}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-amber-500/50 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                    onClick={() => jumpToSection(missingSectionTargets[item] ?? "core-profile")}
                  >
                    Quick edit: {item}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
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

      <section id="professional-experience" className="space-y-3 rounded-lg border p-4">
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

      <section id="certifications" className="space-y-3 rounded-lg border p-4">
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
                className={fieldClass(isMissingValue(experience.company))}
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
                className={fieldClass(isMissingValue(experience.role_title))}
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

      <section id="references" className="space-y-3 rounded-lg border p-4">
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
                className={fieldClass(isMissingValue(certification.name), "md:col-span-3")}
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
                className={fieldClass(isMissingValue(certification.expiry_date))}
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
                className={fieldClass(isMissingValue(reference.name))}
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
                className={fieldClass(isMissingValue(reference.phone))}
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

        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
        <Button onClick={onSave} disabled={saving || publishing}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onPublish}
          disabled={saving || publishing || profileStatus === "published"}
        >
          {profileStatus === "published" ? "Published" : publishing ? "Publishing..." : "Publish profile"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Status: <span className="text-cyan-200">{profileStatus}</span>
          {publishedAt ? ` • ${new Date(publishedAt).toLocaleString("en-GB")}` : ""}
        </p>
        <p className="w-full text-xs text-muted-foreground">
          Publish saves your latest edits first. You need a Headline (or Ambassador headline) in the editor.
        </p>
        {message ? <p className="w-full text-sm text-cyan-200">{message}</p> : null}
      </div>
    </div>
  );
}
