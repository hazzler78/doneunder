import { z } from "zod";

/** Criteria accepted by the search_divers RPC. Keep in sync with supabase/migrations/018. */
export const searchCriteriaSchema = z.object({
  certs: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  welding: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  needed_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  location: z.string().trim().max(80).optional(),
  min_dive_hours: z.number().int().min(0).max(100000).optional(),
  min_sat_hours: z.number().int().min(0).max(100000).optional(),
  available_only: z.boolean().default(true),
  verified_only: z.boolean().default(false),
});
export type SearchCriteria = z.infer<typeof searchCriteriaSchema>;

export const MAX_TEASERS = 10;

/** Anonymous teaser – deliberately contains no name, id, contact or exact dates. */
export const teaserSchema = z.object({
  certs_valid: z.number(),
  dive_hours_band: z.string(),
  sat_hours_band: z.string(),
  available: z.boolean(),
  verified: z.boolean(),
  medical_valid: z.boolean(),
  welding: z.boolean(),
});
export type Teaser = z.infer<typeof teaserSchema>;
export type TeaserRow = { slot: number; teaser: Teaser };
export type SearchResult = { searchId: string | null; teasers: TeaserRow[] };

export const revealCardSchema = z.object({
  full_name: z.string().nullable(),
  username: z.string().nullable(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  availability_status: z.string().nullable(),
  mobilization_notice: z.string().nullable(),
  dive_hours: z.number().nullable(),
  sat_hours: z.number().nullable(),
  verified: z.boolean(),
  certifications: z.array(z.object({ name: z.string(), expiry_date: z.string().nullable() })),
});
export type RevealCard = z.infer<typeof revealCardSchema>;

function splitList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalInt(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function criteriaFromForm(form: FormData) {
  const neededUntil = form.get("needed_until");
  const location = form.get("location");
  return searchCriteriaSchema.safeParse({
    certs: splitList(form.get("certs")),
    welding: splitList(form.get("welding")),
    needed_until: typeof neededUntil === "string" && neededUntil ? neededUntil : undefined,
    location: typeof location === "string" && location.trim() ? location : undefined,
    min_dive_hours: optionalInt(form.get("min_dive_hours")),
    min_sat_hours: optionalInt(form.get("min_sat_hours")),
    available_only: form.get("available_only") === "on",
    verified_only: form.get("verified_only") === "on",
  });
}

/** Parse RPC rows defensively; drops anything that does not match the anonymous teaser shape. */
export function parseSearchRows(rows: unknown): SearchResult {
  if (!Array.isArray(rows) || rows.length === 0) return { searchId: null, teasers: [] };
  const teasers: TeaserRow[] = [];
  let searchId: string | null = null;
  for (const row of rows.slice(0, MAX_TEASERS)) {
    const r = row as { search_id?: unknown; slot?: unknown; teaser?: unknown };
    const teaser = teaserSchema.safeParse(r.teaser);
    if (typeof r.search_id === "string") searchId = r.search_id;
    if (typeof r.slot === "number" && teaser.success) teasers.push({ slot: r.slot, teaser: teaser.data });
  }
  return { searchId, teasers };
}

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Sign in with your company account to search.",
  company_subscription_required: "Search & Match needs an active company subscription.",
  rate_limited: "Search limit reached (20 per hour, 100 per day). Try again later.",
  search_not_found: "That search was not found. Run a new search.",
  search_expired: "This search expired after 30 minutes. Run a new search.",
  already_revealed: "You already revealed a diver from this search. Run a new search for the next match.",
  invalid_slot: "Pick one of the listed matches.",
};

export function friendlyRpcError(message: string | undefined | null): string {
  if (!message) return "Something went wrong. Try again.";
  for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return "Something went wrong. Try again.";
}
