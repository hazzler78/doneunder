"use client";

import { useMemo, useState } from "react";
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

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold">{title}</h2>;
}

export function DiverProfileEditor({ initialData }: Props) {
  const [form, setForm] = useState<EditorData>(initialData);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const actionRequiredCerts = useMemo(
    () => form.certifications.filter((cert) => !cert.expiry_date),
    [form.certifications],
  );

  async function onSave() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/diver/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
    </div>
  );
}
