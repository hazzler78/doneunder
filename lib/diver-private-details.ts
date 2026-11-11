import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const passportEntrySchema = z.object({
  number: z.string().min(1).max(40),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional(),
  label: z.string().max(40).optional(),
});

export const seamanBookSchema = z.object({
  number: z.string().min(1).max(40),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional(),
});

export const diverPrivateDetailsPatchSchema = z
  .object({
    nationality: z.string().max(80).optional(),
    date_of_birth: z.string().max(40).optional().describe("YYYY-MM-DD or DD/MM/YYYY"),
    home_address: z.string().max(2000).optional(),
    mobilization_airport: z.string().max(120).optional(),
    height_cm: z.number().int().min(100).max(250).optional(),
    weight_kg: z.number().int().min(30).max(250).optional(),
    blood_group: z.string().max(12).optional(),
    seaman_book: seamanBookSchema.nullable().optional(),
    passports: z.array(passportEntrySchema).max(4).optional(),
    signature_storage_path: z.string().max(500).optional(),
    confirmed: z
      .boolean()
      .describe("True only after the diver explicitly confirmed saving these sensitive fields."),
  })
  .refine((value) => Object.keys(value).some((k) => k !== "confirmed"), {
    message: "Provide at least one field to save.",
  });

export type DiverPrivateDetailsPatch = z.infer<typeof diverPrivateDetailsPatchSchema>;

export type DiverEducationRow = {
  id: string;
  degree: string;
  institute: string;
  year_completed: string | null;
  sort_order: number;
};

export type DiverPrivateDetailsRow = {
  user_id: string;
  nationality: string | null;
  date_of_birth: string | null;
  home_address: string | null;
  mobilization_airport: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  blood_group: string | null;
  seaman_book: z.infer<typeof seamanBookSchema> | null;
  passports: z.infer<typeof passportEntrySchema>[] | null;
  signature_storage_path: string | null;
  sensitive_data_consent_at: string | null;
};

export type DiverOnboardingBundle = {
  privateDetails: DiverPrivateDetailsRow | null;
  education: DiverEducationRow[];
};

export const educationInputSchema = z.object({
  degree: z.string().min(1).max(200),
  institute: z.string().min(1).max(200),
  year_completed: z.string().max(12).optional(),
});

export const diverEducationUpdateSchema = z.object({
  replace_education: z.array(educationInputSchema).max(20).optional(),
  confirmed: z.boolean(),
});

export async function getDiverOnboardingBundle(
  supabase: SupabaseClient,
  diverId: string,
): Promise<DiverOnboardingBundle> {
  const [privateRes, eduRes] = await Promise.all([
    supabase.from("diver_private_details").select("*").eq("user_id", diverId).maybeSingle(),
    supabase
      .from("diver_education")
      .select("id,degree,institute,year_completed,sort_order")
      .eq("diver_id", diverId)
      .order("sort_order", { ascending: true }),
  ]);

  if (privateRes.error) throw privateRes.error;
  if (eduRes.error) throw eduRes.error;

  return {
    privateDetails: (privateRes.data as DiverPrivateDetailsRow | null) ?? null,
    education: (eduRes.data ?? []) as DiverEducationRow[],
  };
}

function normalizeIsoDate(value?: string) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dm = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dm) {
    const [, d, m, y] = dm;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

export async function patchDiverPrivateDetails(
  supabase: SupabaseClient,
  diverId: string,
  patch: DiverPrivateDetailsPatch,
) {
  if (!patch.confirmed) {
    return { ok: false as const, error: "Not saved — diver must confirm before storing sensitive data." };
  }

  const parsed = diverPrivateDetailsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const row: Record<string, unknown> = {
    user_id: diverId,
    updated_at: new Date().toISOString(),
    sensitive_data_consent_at: new Date().toISOString(),
  };
  const body = parsed.data;
  if (body.nationality !== undefined) row.nationality = body.nationality.trim() || null;
  if (body.date_of_birth !== undefined) row.date_of_birth = normalizeIsoDate(body.date_of_birth);
  if (body.home_address !== undefined) row.home_address = body.home_address.trim() || null;
  if (body.mobilization_airport !== undefined) row.mobilization_airport = body.mobilization_airport.trim() || null;
  if (body.height_cm !== undefined) row.height_cm = body.height_cm;
  if (body.weight_kg !== undefined) row.weight_kg = body.weight_kg;
  if (body.blood_group !== undefined) row.blood_group = body.blood_group.trim() || null;
  if (body.seaman_book !== undefined) row.seaman_book = body.seaman_book;
  if (body.passports !== undefined) row.passports = body.passports;
  if (body.signature_storage_path !== undefined) row.signature_storage_path = body.signature_storage_path || null;

  const { error } = await supabase.from("diver_private_details").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false as const, error: error.message };

  const bundle = await getDiverOnboardingBundle(supabase, diverId);
  return { ok: true as const, bundle };
}

export async function replaceDiverEducation(
  supabase: SupabaseClient,
  diverId: string,
  rows: z.infer<typeof educationInputSchema>[],
  confirmed: boolean,
) {
  if (!confirmed) {
    return { ok: false as const, error: "Not saved — diver must confirm education history." };
  }
  const { error: delError } = await supabase.from("diver_education").delete().eq("diver_id", diverId);
  if (delError) return { ok: false as const, error: delError.message };

  if (rows.length > 0) {
    const insert = rows.map((row, index) => ({
      diver_id: diverId,
      degree: row.degree.trim(),
      institute: row.institute.trim(),
      year_completed: row.year_completed?.trim() || null,
      sort_order: index,
    }));
    const { error } = await supabase.from("diver_education").insert(insert);
    if (error) return { ok: false as const, error: error.message };
  }

  const bundle = await getDiverOnboardingBundle(supabase, diverId);
  return { ok: true as const, education: bundle.education };
}
