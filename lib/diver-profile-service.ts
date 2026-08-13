import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIVER_CERTIFICATION_COLUMNS,
  DIVER_EXPERIENCE_COLUMNS,
  DIVER_PROFILE_SCALAR_COLUMNS,
  DIVER_REFERENCE_COLUMNS,
  type DiverCertificationInput,
  type DiverExperienceInput,
  type DiverProfileFull,
  type ConversationalCvUpdate,
  type DiverProfilePatch,
  type DiverProfilePayload,
  type DiverProfileScalars,
  type DiverReferenceInput,
  type PolishedCvJson,
  type ProfileValidationResult,
  conversationalCvUpdateSchema,
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

function patchTouchesChildRows(patch: DiverProfilePatch) {
  return patch.experiences !== undefined || patch.certifications !== undefined || patch.references !== undefined;
}

function normalizeExperienceInput(exp: DiverExperienceInput): DiverExperienceInput {
  return {
    ...exp,
    company: (exp.company ?? "").trim() || "Unknown",
    role_title: (exp.role_title ?? "").trim() || "Commercial Diver",
    project_name: exp.project_name?.trim() || undefined,
    location: exp.location?.trim() || undefined,
    date_start: exp.date_start ?? undefined,
    date_end: exp.date_end ?? undefined,
    summary: exp.summary?.trim() || undefined,
    source_ref: exp.source_ref ?? undefined,
  };
}

function normalizeCertificationInput(cert: DiverCertificationInput): DiverCertificationInput {
  return {
    ...cert,
    name: (cert.name ?? "").trim() || "Certification",
    issue_date: cert.issue_date ?? undefined,
    expiry_date: cert.expiry_date ?? undefined,
    cert_number: cert.cert_number?.trim() || undefined,
    issuing_body: cert.issuing_body?.trim() || undefined,
    source_ref: cert.source_ref ?? undefined,
  };
}

function normalizeReferenceInput(ref: DiverReferenceInput): DiverReferenceInput {
  return {
    ...ref,
    name: (ref.name ?? "").trim() || "Reference",
    phone: (ref.phone ?? "").trim() || "Not provided",
    company: ref.company?.trim() || undefined,
    email: ref.email?.trim() || undefined,
    source_ref: ref.source_ref ?? undefined,
  };
}

function normalizeProfilePayloadForSave(payload: DiverProfilePayload): DiverProfilePayload {
  return {
    ...payload,
    experiences: payload.experiences.map(normalizeExperienceInput),
    certifications: payload.certifications.map(normalizeCertificationInput),
    references: payload.references.map(normalizeReferenceInput),
  };
}

async function patchDiverProfileScalars(
  supabase: DbClient,
  diverId: string,
  patch: DiverProfilePatch,
  current: DiverProfileFull,
) {
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: nowIso };

  if (patch.headline !== undefined) update.headline = patch.headline;
  if (patch.bio !== undefined) update.bio = patch.bio;
  if (patch.location !== undefined) update.location = patch.location;
  if (patch.mobilization_notice !== undefined) update.mobilization_notice = patch.mobilization_notice;
  if (patch.availability_status !== undefined) update.availability_status = patch.availability_status;
  if (patch.sat_hours !== undefined) update.sat_hours = patch.sat_hours;
  if (patch.dive_hours !== undefined) update.dive_hours = patch.dive_hours;
  if (patch.polished_cv_markdown !== undefined) update.polished_cv_markdown = patch.polished_cv_markdown;
  if (patch.ambassador_public_headline !== undefined) {
    update.ambassador_public_headline = normalizeOptionalString(patch.ambassador_public_headline);
  }
  if (patch.ambassador_short_bio !== undefined) {
    update.ambassador_short_bio = normalizeOptionalString(patch.ambassador_short_bio);
  }
  if (patch.ambassador_key_highlights !== undefined) update.ambassador_key_highlights = patch.ambassador_key_highlights;
  if (patch.headline_source !== undefined) update.headline_source = patch.headline_source;
  if (patch.headline_source_ref !== undefined) update.headline_source_ref = patch.headline_source_ref ?? null;
  if (patch.bio_source !== undefined) update.bio_source = patch.bio_source;
  if (patch.bio_source_ref !== undefined) update.bio_source_ref = patch.bio_source_ref ?? null;
  if (patch.import_batch_id !== undefined) update.import_batch_id = patch.import_batch_id;

  if (patch.polished_cv_json !== undefined) {
    update.polished_cv_json = patch.polished_cv_json;
  } else if (current.profile.polished_cv_json) {
    const polishedCvJson = { ...current.profile.polished_cv_json };
    if (patch.location !== undefined) polishedCvJson.location = patch.location || undefined;
    if (patch.mobilization_notice !== undefined) {
      polishedCvJson.mobilization_notice = patch.mobilization_notice || undefined;
    }
    if (patch.availability_status !== undefined) polishedCvJson.availability_status = patch.availability_status;
    if (patch.sat_hours !== undefined) polishedCvJson.sat_hours = patch.sat_hours;
    if (patch.dive_hours !== undefined) polishedCvJson.dive_hours = patch.dive_hours;
    update.polished_cv_json = polishedCvJson;
  }

  const { error } = await supabase.from("diver_profiles").update(update).eq("user_id", diverId);
  if (error) throw new Error(error.message);

  return getDiverProfile(supabase, diverId);
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  if (["present", "current", "ongoing", "to date", "now"].includes(normalized)) {
    return null;
  }

  // Accept already normalized values.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;

  // Best-effort parse for values like "Mar 2024".
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  // Drop unparseable values instead of breaking the whole profile save.
  return null;
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

function effectiveHeadline(payload: Pick<DiverProfilePayload, "headline" | "ambassador_public_headline">) {
  return payload.headline.trim() || payload.ambassador_public_headline?.trim() || "";
}

function effectiveBio(payload: Pick<DiverProfilePayload, "bio" | "ambassador_short_bio">) {
  return payload.bio.trim() || payload.ambassador_short_bio?.trim() || "";
}

/** Fills empty core fields from ambassador copy before publish validation. */
export function normalizeProfileForPublish(current: DiverProfileFull): DiverProfilePayload {
  const headline = effectiveHeadline({
    headline: current.profile.headline,
    ambassador_public_headline: current.profile.ambassador_public_headline ?? undefined,
  });
  const bio = effectiveBio({
    bio: current.profile.bio,
    ambassador_short_bio: current.profile.ambassador_short_bio ?? undefined,
  });

  return {
    headline,
    bio,
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
}

export function validateDiverProfile(payload: DiverProfilePayload): ProfileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!effectiveHeadline(payload)) {
    errors.push("Headline is required. Add a Headline or Ambassador public headline, then save your profile.");
  }
  if (!effectiveBio(payload)) warnings.push("Bio is empty.");
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
  const payload = diverProfilePayloadSchema.parse(normalizeProfilePayloadForSave(rawPayload));
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

  if (!patchTouchesChildRows(patch)) {
    return patchDiverProfileScalars(supabase, diverId, patch, current);
  }

  const childRowsChanged = patchTouchesChildRows(patch);
  const rebuildCvDocument = childRowsChanged && patch.polished_cv_markdown === undefined;

  const merged: DiverProfilePayload = {
    headline: patch.headline ?? current.profile.headline,
    bio: patch.bio ?? current.profile.bio,
    location: patch.location ?? current.profile.location,
    mobilization_notice: patch.mobilization_notice ?? current.profile.mobilization_notice,
    availability_status: patch.availability_status ?? current.profile.availability_status,
    sat_hours: patch.sat_hours ?? current.profile.sat_hours,
    dive_hours: patch.dive_hours ?? current.profile.dive_hours,
    polished_cv_markdown: rebuildCvDocument
      ? undefined
      : (patch.polished_cv_markdown ?? current.profile.polished_cv_markdown ?? undefined),
    polished_cv_json: patch.polished_cv_json ?? (rebuildCvDocument ? undefined : current.profile.polished_cv_json),
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

  return saveDiverProfile(supabase, diverId, normalizeProfilePayloadForSave(merged), meta);
}

function includesLoose(haystack: string, needle: string) {
  const left = haystack.trim().toLowerCase();
  const right = needle.trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function findExperienceIndex(
  items: DiverExperienceInput[],
  match: { id?: string; company?: string; role_title?: string },
) {
  if (match.id) {
    const byId = items.findIndex((item) => item.id === match.id);
    if (byId >= 0) return byId;
  }
  return items.findIndex((item) => {
    const companyHit = match.company ? includesLoose(item.company, match.company) : true;
    const roleHit = match.role_title ? includesLoose(item.role_title, match.role_title) : true;
    return companyHit && roleHit;
  });
}

function findCertificationIndex(
  items: DiverCertificationInput[],
  match: { id?: string; name?: string },
) {
  if (match.id) {
    const byId = items.findIndex((item) => item.id === match.id);
    if (byId >= 0) return byId;
  }
  if (!match.name) return -1;
  return items.findIndex((item) => includesLoose(item.name, match.name!));
}

function findReferenceIndex(
  items: DiverReferenceInput[],
  match: { id?: string; name?: string; company?: string },
) {
  if (match.id) {
    const byId = items.findIndex((item) => item.id === match.id);
    if (byId >= 0) return byId;
  }
  return items.findIndex((item) => {
    const nameHit = match.name ? includesLoose(item.name, match.name) : true;
    const companyHit = match.company ? includesLoose(item.company ?? "", match.company) : true;
    return nameHit && companyHit;
  });
}

function describeMatch(match: Record<string, string | undefined>) {
  return Object.entries(match)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function toSaveablePayload(current: DiverProfileFull): DiverProfilePayload {
  return {
    headline: current.profile.headline,
    bio: current.profile.bio,
    location: current.profile.location,
    mobilization_notice: current.profile.mobilization_notice,
    availability_status: current.profile.availability_status,
    sat_hours: current.profile.sat_hours,
    dive_hours: current.profile.dive_hours,
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
}

export type ConversationalCvUpdateResult = {
  ok: boolean;
  profile: DiverProfileFull;
  changed: string[];
  errors: string[];
};

/**
 * Apply add/update/remove CV edits from chat, then rebuild the polished CV document.
 */
export async function applyConversationalCvUpdate(
  supabase: DbClient,
  diverId: string,
  rawUpdate: ConversationalCvUpdate,
  meta: { sourceRef?: string } = {},
): Promise<ConversationalCvUpdateResult> {
  const update = conversationalCvUpdateSchema.parse(rawUpdate);
  const current = await getDiverProfile(supabase, diverId);
  const sourceRef = meta.sourceRef ?? "source: web-chat";
  const changed: string[] = [];
  const errors: string[] = [];

  const payload = toSaveablePayload(current);
  let experiences: DiverExperienceInput[] = [...payload.experiences];
  let certifications: DiverCertificationInput[] = [...payload.certifications];
  let references: DiverReferenceInput[] = [...payload.references];

  const scalarKeys = [
    "headline",
    "bio",
    "location",
    "mobilization_notice",
    "availability_status",
    "sat_hours",
    "dive_hours",
    "ambassador_public_headline",
    "ambassador_short_bio",
    "ambassador_key_highlights",
  ] as const;

  for (const key of scalarKeys) {
    if (update[key] !== undefined) {
      (payload as Record<string, unknown>)[key] = update[key];
      changed.push(key);
    }
  }

  if (update.headline !== undefined) {
    payload.headline_source = "ai";
    payload.headline_source_ref = sourceRef;
  }
  if (update.bio !== undefined || update.ambassador_short_bio !== undefined) {
    payload.bio_source = "ai";
    payload.bio_source_ref = sourceRef;
  }

  if (update.replace_experiences?.length) {
    experiences = update.replace_experiences.map((item) => ({
      ...item,
      source: "ai" as const,
      source_ref: sourceRef,
    }));
    changed.push("experiences");
  }
  if (update.replace_certifications?.length) {
    certifications = update.replace_certifications.map((item) => ({
      ...item,
      source: "ai" as const,
      source_ref: sourceRef,
    }));
    changed.push("certifications");
  }
  if (update.replace_references?.length) {
    references = update.replace_references.map((item) => ({
      ...item,
      phone: item.phone?.trim() || "Not provided",
      name: item.name ?? "Reference",
      source: "ai" as const,
      source_ref: sourceRef,
    }));
    changed.push("references");
  }

  for (const match of update.remove_experiences ?? []) {
    const index = findExperienceIndex(experiences, match);
    if (index < 0) {
      errors.push(`Could not find experience to remove (${describeMatch(match)}).`);
      continue;
    }
    experiences.splice(index, 1);
    if (!changed.includes("experiences")) changed.push("experiences");
  }
  for (const match of update.remove_certifications ?? []) {
    const index = findCertificationIndex(certifications, match);
    if (index < 0) {
      errors.push(`Could not find certification to remove (${describeMatch(match)}).`);
      continue;
    }
    certifications.splice(index, 1);
    if (!changed.includes("certifications")) changed.push("certifications");
  }
  for (const match of update.remove_references ?? []) {
    const index = findReferenceIndex(references, match);
    if (index < 0) {
      errors.push(`Could not find reference to remove (${describeMatch(match)}).`);
      continue;
    }
    references.splice(index, 1);
    if (!changed.includes("references")) changed.push("references");
  }

  for (const item of update.update_experiences ?? []) {
    const index = findExperienceIndex(experiences, item.match);
    if (index < 0) {
      errors.push(`Could not find experience to update (${describeMatch(item.match)}).`);
      continue;
    }
    experiences[index] = {
      ...experiences[index],
      ...item.patch,
      source: "ai",
      source_ref: sourceRef,
    };
    if (!changed.includes("experiences")) changed.push("experiences");
  }
  for (const item of update.update_certifications ?? []) {
    const index = findCertificationIndex(certifications, item.match);
    if (index < 0) {
      errors.push(`Could not find certification to update (${describeMatch(item.match)}).`);
      continue;
    }
    certifications[index] = {
      ...certifications[index],
      ...item.patch,
      source: "ai",
      source_ref: sourceRef,
    };
    if (!changed.includes("certifications")) changed.push("certifications");
  }
  for (const item of update.update_references ?? []) {
    const index = findReferenceIndex(references, item.match);
    if (index < 0) {
      errors.push(`Could not find reference to update (${describeMatch(item.match)}).`);
      continue;
    }
    references[index] = {
      ...references[index],
      ...item.patch,
      source: "ai",
      source_ref: sourceRef,
    };
    if (!changed.includes("references")) changed.push("references");
  }

  if (update.add_experiences?.length) {
    const incoming = update.add_experiences.map((item) => ({
      ...item,
      source: "ai" as const,
      source_ref: sourceRef,
    }));
    experiences = [...incoming, ...experiences];
    if (!changed.includes("experiences")) changed.push("experiences");
  }
  if (update.add_certifications?.length) {
    const incoming = update.add_certifications.map((item) => ({
      ...item,
      source: "ai" as const,
      source_ref: sourceRef,
    }));
    certifications = [...certifications, ...incoming];
    if (!changed.includes("certifications")) changed.push("certifications");
  }
  if (update.add_references?.length) {
    const incoming = update.add_references.map((item) => ({
      ...item,
      name: item.name ?? "Reference",
      phone: item.phone?.trim() || "Not provided",
      source: "ai" as const,
      source_ref: sourceRef,
    }));
    references = [...references, ...incoming];
    if (!changed.includes("references")) changed.push("references");
  }

  if (changed.length === 0) {
    return { ok: false, profile: current, changed, errors };
  }

  payload.experiences = experiences;
  payload.certifications = certifications;
  payload.references = references;
  payload.polished_cv_json = syncPolishedCvJson(payload);
  payload.polished_cv_markdown = buildPolishedCvMarkdown({
    ...payload,
    polished_cv_json: payload.polished_cv_json,
  });

  const profile = await saveDiverProfile(supabase, diverId, normalizeProfilePayloadForSave(payload));
  return { ok: true, profile, changed, errors };
}

export async function publishDiverProfile(supabase: DbClient, diverId: string) {
  const current = await getDiverProfile(supabase, diverId);

  const { data: existingRow } = await supabase.from("diver_profiles").select("user_id").eq("user_id", diverId).maybeSingle();
  if (!existingRow) {
    return {
      ok: false as const,
      validation: {
        ok: false,
        errors: ["No saved profile yet. Click Save profile before publishing."],
        warnings: [],
      },
      profile: current,
    };
  }

  const payload = normalizeProfileForPublish(current);

  const validation = validateDiverProfile(payload);
  if (!validation.ok) {
    return { ok: false as const, validation, profile: current };
  }

  const nowIso = new Date().toISOString();
  const syncScalars: Record<string, string> = {};
  if (!current.profile.headline.trim() && payload.headline) syncScalars.headline = payload.headline;
  if (!current.profile.bio.trim() && payload.bio) syncScalars.bio = payload.bio;

  const { error } = await supabase
    .from("diver_profiles")
    .update({
      profile_status: "published",
      published_at: nowIso,
      updated_at: nowIso,
      ...syncScalars,
    })
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
