import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIVER_CERTIFICATION_COLUMNS,
  DIVER_EXPERIENCE_COLUMNS,
  DIVER_PROFILE_SCALAR_COLUMNS,
  DIVER_REFERENCE_COLUMNS,
  type DiverCertificationInput,
  type DiverExperienceInput,
  type DiverProfileFull,
  type DiverProfilePatch,
  type DiverProfilePayload,
  type DiverProfileScalars,
  type DiverReferenceInput,
  type PolishedCvJson,
  type ProfileValidationResult,
  diverProfilePatchSchema,
  diverProfilePayloadSchema,
  emptyDiverProfileScalars,
  polishedCvJsonSchema,
} from "@/lib/diver-profile";

type DbClient = SupabaseClient;

export type SaveProfileMeta = {
  importBatchId?: string | null;
  cvLastProcessedAt?: string | null;
};

function formatCvDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function mapProfileRow(row: Record<string, unknown> | null): DiverProfileScalars {
  if (!row) return emptyDiverProfileScalars();

  const polishedCvJson = row.polished_cv_json;
  const parsedJson =
    polishedCvJson && typeof polishedCvJson === "object"
      ? polishedCvJsonSchema.safeParse(polishedCvJson).data ?? null
      : null;

  return {
    headline: (row.headline as string | null) ?? "",
    bio: (row.bio as string | null) ?? "",
    location: (row.location as string | null) ?? "",
    mobilization_notice: (row.mobilization_notice as string | null) ?? "",
    availability_status: row.availability_status === "deployed" ? "deployed" : "available",
    sat_hours: Number(row.sat_hours ?? 0),
    dive_hours: Number(row.dive_hours ?? 0),
    polished_cv_markdown: (row.polished_cv_markdown as string | null) ?? null,
    polished_cv_json: parsedJson,
    ambassador_public_headline: (row.ambassador_public_headline as string | null) ?? null,
    ambassador_short_bio: (row.ambassador_short_bio as string | null) ?? null,
    ambassador_key_highlights: Array.isArray(row.ambassador_key_highlights)
      ? row.ambassador_key_highlights.filter((item): item is string => typeof item === "string")
      : [],
    headline_source: row.headline_source === "ai" || row.headline_source === "linkedin" ? row.headline_source : "manual",
    headline_source_ref: (row.headline_source_ref as string | null) ?? null,
    bio_source: row.bio_source === "ai" || row.bio_source === "linkedin" ? row.bio_source : "manual",
    bio_source_ref: (row.bio_source_ref as string | null) ?? null,
    import_batch_id: (row.import_batch_id as string | null) ?? null,
    profile_status: row.profile_status === "published" ? "published" : "draft",
    published_at: (row.published_at as string | null) ?? null,
    cv_last_processed_at: (row.cv_last_processed_at as string | null) ?? null,
    last_verified_at: (row.last_verified_at as string | null) ?? null,
    verified: Boolean(row.verified),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export function syncPolishedCvJson(payload: DiverProfilePayload): PolishedCvJson {
  return {
    location: payload.location || undefined,
    mobilization_notice: payload.mobilization_notice || undefined,
    availability_status: payload.availability_status,
    sat_hours: payload.sat_hours,
    dive_hours: payload.dive_hours,
    experiences: payload.experiences.map(({ company, project_name, location, role_title, date_start, date_end, summary }) => ({
      company,
      project_name,
      location,
      role_title,
      date_start,
      date_end,
      summary,
    })),
    certifications: payload.certifications.map(
      ({ name, issue_date, expiry_date, cert_number, issuing_body }) => ({
        name,
        issue_date,
        expiry_date,
        cert_number,
        issuing_body,
      }),
    ),
    references: payload.references.map(({ name, company, phone, email }) => ({
      name,
      company,
      phone,
      email,
    })),
  };
}

export function buildPolishedCvMarkdown(payload: DiverProfilePayload): string {
  const ambassadorShortBio = payload.ambassador_short_bio ?? payload.bio;
  const ambassadorHighlights = payload.ambassador_key_highlights ?? [];
  const lines: string[] = [];

  lines.push(`# ${payload.headline || "Commercial Diver CV"}`);
  lines.push("");
  lines.push(`**Location:** ${payload.location || "Not provided"}`);
  lines.push(`**Availability:** ${payload.availability_status === "available" ? "Available" : "Deployed"}`);
  lines.push(`**Mobilization:** ${payload.mobilization_notice || "Not provided"}`);
  lines.push(`**Sat Hours:** ${payload.sat_hours > 0 ? payload.sat_hours.toLocaleString() : "Not declared"}`);
  lines.push(`**Dive Hours:** ${payload.dive_hours > 0 ? payload.dive_hours.toLocaleString() : "Not declared"}`);
  lines.push("");
  lines.push("## Professional Summary");
  lines.push(ambassadorShortBio || "Not provided.");
  lines.push("");

  if (ambassadorHighlights.length > 0) {
    lines.push("## Key Highlights");
    ambassadorHighlights.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  lines.push("## Professional Experience");
  if (payload.experiences.length === 0) {
    lines.push("- Not provided.");
  } else {
    payload.experiences.forEach((exp) => {
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
  if (payload.certifications.length === 0) {
    lines.push("- Not provided.");
  } else {
    payload.certifications.forEach((cert) => {
      const issue = formatCvDate(cert.issue_date) || "Not provided";
      const expiry = formatCvDate(cert.expiry_date) || "Not provided";
      const certId = cert.cert_number ? ` (#${cert.cert_number})` : "";
      lines.push(`- **${cert.name}${certId}** — Issued: ${issue}, Expires: ${expiry}`);
    });
  }
  lines.push("");

  lines.push("## References");
  if (payload.references.length === 0) {
    lines.push("- Available on request.");
  } else {
    payload.references.forEach((ref) => {
      const detail = [ref.company, ref.phone, ref.email].filter(Boolean).join(" • ");
      lines.push(`- **${ref.name}**${detail ? ` — ${detail}` : ""}`);
    });
  }

  return lines.join("\n");
}

export function validateDiverProfile(payload: DiverProfilePayload): ProfileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload.headline.trim()) errors.push("Headline is required.");
  if (!payload.bio.trim()) warnings.push("Bio is empty.");
  if (!payload.location.trim()) warnings.push("Location is empty.");
  if (payload.certifications.length === 0) warnings.push("No certifications listed.");
  if (payload.experiences.length === 0) warnings.push("No professional experience listed.");

  payload.certifications.forEach((cert, index) => {
    if (!cert.expiry_date) warnings.push(`Certification #${index + 1} (${cert.name}) has no expiry date.`);
  });

  payload.references.forEach((ref, index) => {
    if (!ref.phone.trim()) errors.push(`Reference #${index + 1} (${ref.name}) requires a phone number.`);
  });

  return { ok: errors.length === 0, errors, warnings };
}

function payloadToProfileRecord(
  diverId: string,
  payload: DiverProfilePayload,
  meta: SaveProfileMeta,
  nowIso: string,
) {
  const polishedCvJson = payload.polished_cv_json ?? syncPolishedCvJson(payload);

  return {
    user_id: diverId,
    headline: payload.headline,
    bio: payload.bio,
    location: payload.location,
    mobilization_notice: payload.mobilization_notice,
    availability_status: payload.availability_status,
    sat_hours: payload.sat_hours,
    dive_hours: payload.dive_hours,
    polished_cv_markdown: payload.polished_cv_markdown ?? buildPolishedCvMarkdown(payload),
    polished_cv_json: polishedCvJson,
    ambassador_public_headline: normalizeOptionalString(payload.ambassador_public_headline),
    ambassador_short_bio: normalizeOptionalString(payload.ambassador_short_bio),
    ambassador_key_highlights: payload.ambassador_key_highlights ?? [],
    headline_source: payload.headline_source ?? "manual",
    headline_source_ref: payload.headline_source_ref ?? null,
    bio_source: payload.bio_source ?? "manual",
    bio_source_ref: payload.bio_source_ref ?? null,
    import_batch_id: meta.importBatchId ?? payload.import_batch_id ?? null,
    updated_at: nowIso,
    ...(meta.cvLastProcessedAt ? { cv_last_processed_at: meta.cvLastProcessedAt } : {}),
  };
}

async function replaceChildRows(
  supabase: DbClient,
  diverId: string,
  payload: Pick<DiverProfilePayload, "experiences" | "certifications" | "references">,
  importBatchId: string | null,
  nowIso: string,
) {
  await Promise.all([
    supabase.from("diver_experiences").delete().eq("diver_id", diverId),
    supabase.from("diver_certifications").delete().eq("diver_id", diverId),
    supabase.from("diver_references").delete().eq("diver_id", diverId),
  ]);

  if (payload.experiences.length > 0) {
    const { error } = await supabase.from("diver_experiences").insert(
      payload.experiences.map((item: DiverExperienceInput, index: number) => ({
        diver_id: diverId,
        company: item.company,
        project_name: item.project_name || null,
        location: item.location || null,
        role_title: item.role_title,
        date_start: normalizeDate(item.date_start),
        date_end: normalizeDate(item.date_end),
        summary: item.summary || null,
        sort_order: index,
        source: item.source ?? "manual",
        source_ref: item.source_ref || null,
        import_batch_id: importBatchId,
        updated_at: nowIso,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (payload.certifications.length > 0) {
    const { error } = await supabase.from("diver_certifications").insert(
      payload.certifications.map((item: DiverCertificationInput, index: number) => ({
        diver_id: diverId,
        name: item.name,
        issue_date: normalizeDate(item.issue_date),
        expiry_date: normalizeDate(item.expiry_date),
        cert_number: item.cert_number || null,
        issuing_body: item.issuing_body || null,
        sort_order: index,
        source: item.source ?? "manual",
        source_ref: item.source_ref || null,
        import_batch_id: importBatchId,
        updated_at: nowIso,
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (payload.references.length > 0) {
    const { error } = await supabase.from("diver_references").insert(
      payload.references.map((item: DiverReferenceInput, index: number) => ({
        diver_id: diverId,
        name: item.name,
        company: item.company || null,
        phone: item.phone,
        email: item.email || null,
        sort_order: index,
        source: item.source ?? "manual",
        source_ref: item.source_ref || null,
        import_batch_id: importBatchId,
        updated_at: nowIso,
      })),
    );
    if (error) throw new Error(error.message);
  }
}

export async function getDiverProfile(supabase: DbClient, diverId: string): Promise<DiverProfileFull> {
  const [{ data: profile }, { data: experiences }, { data: certifications }, { data: references }] = await Promise.all([
    supabase.from("diver_profiles").select(DIVER_PROFILE_SCALAR_COLUMNS).eq("user_id", diverId).maybeSingle(),
    supabase
      .from("diver_experiences")
      .select(DIVER_EXPERIENCE_COLUMNS)
      .eq("diver_id", diverId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("diver_certifications")
      .select(DIVER_CERTIFICATION_COLUMNS)
      .eq("diver_id", diverId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("diver_references")
      .select(DIVER_REFERENCE_COLUMNS)
      .eq("diver_id", diverId)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    profile: mapProfileRow(profile),
    experiences: (experiences ?? []) as DiverProfileFull["experiences"],
    certifications: (certifications ?? []) as DiverProfileFull["certifications"],
    references: (references ?? []) as DiverProfileFull["references"],
  };
}

export async function saveDiverProfile(
  supabase: DbClient,
  diverId: string,
  rawPayload: DiverProfilePayload,
  meta: SaveProfileMeta = {},
) {
  const payload = diverProfilePayloadSchema.parse(rawPayload);
  const nowIso = new Date().toISOString();
  const importBatchId = meta.importBatchId ?? payload.import_batch_id ?? null;

  const { error: profileError } = await supabase
    .from("diver_profiles")
    .upsert(payloadToProfileRecord(diverId, payload, meta, nowIso), { onConflict: "user_id" });

  if (profileError) {
    throw new Error(profileError.message);
  }

  await replaceChildRows(supabase, diverId, payload, importBatchId, nowIso);

  return getDiverProfile(supabase, diverId);
}

export async function patchDiverProfile(
  supabase: DbClient,
  diverId: string,
  rawPatch: DiverProfilePatch,
  meta: SaveProfileMeta = {},
) {
  const patch = diverProfilePatchSchema.parse(rawPatch);
  const current = await getDiverProfile(supabase, diverId);
  const merged: DiverProfilePayload = {
    headline: patch.headline ?? current.profile.headline,
    bio: patch.bio ?? current.profile.bio,
    location: patch.location ?? current.profile.location,
    mobilization_notice: patch.mobilization_notice ?? current.profile.mobilization_notice,
    availability_status: patch.availability_status ?? current.profile.availability_status,
    sat_hours: patch.sat_hours ?? current.profile.sat_hours,
    dive_hours: patch.dive_hours ?? current.profile.dive_hours,
    polished_cv_markdown: patch.polished_cv_markdown ?? current.profile.polished_cv_markdown ?? undefined,
    polished_cv_json: patch.polished_cv_json ?? current.profile.polished_cv_json,
    ambassador_public_headline: patch.ambassador_public_headline ?? current.profile.ambassador_public_headline ?? undefined,
    ambassador_short_bio: patch.ambassador_short_bio ?? current.profile.ambassador_short_bio ?? undefined,
    ambassador_key_highlights: patch.ambassador_key_highlights ?? current.profile.ambassador_key_highlights,
    headline_source: patch.headline_source ?? current.profile.headline_source,
    headline_source_ref: patch.headline_source_ref ?? current.profile.headline_source_ref ?? undefined,
    bio_source: patch.bio_source ?? current.profile.bio_source,
    bio_source_ref: patch.bio_source_ref ?? current.profile.bio_source_ref ?? undefined,
    import_batch_id: patch.import_batch_id ?? current.profile.import_batch_id,
    experiences: patch.experiences ?? current.experiences,
    certifications: patch.certifications ?? current.certifications,
    references: patch.references ?? current.references,
  };

  return saveDiverProfile(supabase, diverId, merged, meta);
}

export async function publishDiverProfile(supabase: DbClient, diverId: string) {
  const current = await getDiverProfile(supabase, diverId);
  const payload: DiverProfilePayload = {
    headline: current.profile.headline,
    bio: current.profile.bio,
    location: current.profile.location,
    mobilization_notice: current.profile.mobilization_notice,
    availability_status: current.profile.availability_status,
    sat_hours: current.profile.sat_hours,
    dive_hours: current.profile.dive_hours,
    polished_cv_markdown: current.profile.polished_cv_markdown ?? undefined,
    polished_cv_json: current.profile.polished_cv_json,
    ambassador_public_headline: current.profile.ambassador_public_headline ?? undefined,
    ambassador_short_bio: current.profile.ambassador_short_bio ?? undefined,
    ambassador_key_highlights: current.profile.ambassador_key_highlights,
    headline_source: current.profile.headline_source,
    headline_source_ref: current.profile.headline_source_ref ?? undefined,
    bio_source: current.profile.bio_source,
    bio_source_ref: current.profile.bio_source_ref ?? undefined,
    import_batch_id: current.profile.import_batch_id,
    experiences: current.experiences,
    certifications: current.certifications,
    references: current.references,
  };

  const validation = validateDiverProfile(payload);
  if (!validation.ok) {
    return { ok: false as const, validation, profile: current };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("diver_profiles")
    .update({ profile_status: "published", published_at: nowIso, updated_at: nowIso })
    .eq("user_id", diverId);

  if (error) {
    throw new Error(error.message);
  }

  const profile = await getDiverProfile(supabase, diverId);
  return { ok: true as const, validation, profile };
}

/** Maps AI CV output into a canonical DiverProfilePayload. */
export function aiCvOutputToPayload(
  output: {
    professional_headline: string;
    polished_cv_markdown: string;
    polished_cv_json: PolishedCvJson;
    ambassador_page: { public_headline: string; short_bio: string; key_highlights: string[] };
  },
  meta: { sourceRef: string; importBatchId: string },
): DiverProfilePayload {
  const profile = output.polished_cv_json;

  return {
    headline: output.professional_headline,
    bio: output.ambassador_page.short_bio,
    location: profile.location ?? "",
    mobilization_notice: profile.mobilization_notice ?? "",
    availability_status: profile.availability_status ?? "available",
    sat_hours: profile.sat_hours ?? 0,
    dive_hours: profile.dive_hours ?? 0,
    polished_cv_markdown: output.polished_cv_markdown,
    polished_cv_json: profile,
    ambassador_public_headline: output.ambassador_page.public_headline,
    ambassador_short_bio: output.ambassador_page.short_bio,
    ambassador_key_highlights: output.ambassador_page.key_highlights,
    headline_source: "ai",
    headline_source_ref: meta.sourceRef,
    bio_source: "ai",
    bio_source_ref: meta.sourceRef,
    import_batch_id: meta.importBatchId,
    experiences: profile.experiences.map((item) => ({ ...item, source: "ai" as const, source_ref: meta.sourceRef })),
    certifications: profile.certifications.map((item) => ({ ...item, source: "ai" as const, source_ref: meta.sourceRef })),
    references: profile.references.map((item) => ({
      name: item.name,
      company: item.company,
      phone: item.phone ?? "Not provided",
      email: item.email,
      source: "ai" as const,
      source_ref: meta.sourceRef,
    })),
  };
}
