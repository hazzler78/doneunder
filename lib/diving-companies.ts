import type { SupabaseClient } from "@supabase/supabase-js";
import { isTicketExpired, type DiverTicket } from "@/lib/jobs";

export type DivingCompanyStatus = "active" | "skip";
export type DivingCompanyScope = "offshore" | "inshore";

export type DivingCompany = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  location: string | null;
  website: string | null;
  scopes: string[];
  typical_certs: string[];
  notes: string | null;
  hire_graduates: boolean;
  apply_email: string | null;
  status: DivingCompanyStatus;
  updated_at: string;
};

export type CompanyMatch = {
  have: string[];
  missing: string[];
  expired: string[];
  locationFit: boolean;
  score: number;
  verdict: "strong" | "possible" | "weak";
  canApply: boolean;
};

const COMPANY_COLUMNS =
  "id,slug,name,country,location,website,scopes,typical_certs,notes,hire_graduates,apply_email,status,updated_at" as const;

function namesMatch(required: string, ticketName: string) {
  const needle = required.toLowerCase();
  const name = ticketName.toLowerCase();
  if (name.includes(needle) || needle.includes(name)) return true;
  const tokens = needle.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  return tokens.length > 0 && tokens.every((token) => name.includes(token));
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function scoreDiverAgainstCompany(
  company: Pick<DivingCompany, "typical_certs" | "location" | "country" | "apply_email">,
  input: {
    certs?: DiverTicket[];
    certNames?: string[];
    location?: string | null;
  },
  now = new Date(),
): CompanyMatch {
  const tickets: DiverTicket[] =
    input.certs ?? (input.certNames ?? []).map((name) => ({ name, expiryDate: null }));

  const typical = company.typical_certs ?? [];
  const have: string[] = [];
  const missing: string[] = [];
  const expired: string[] = [];

  for (const cert of typical) {
    const hit = tickets.find((ticket) => namesMatch(cert, ticket.name));
    if (!hit) {
      missing.push(cert);
      continue;
    }
    if (isTicketExpired(hit.expiryDate, now)) {
      expired.push(cert);
      continue;
    }
    have.push(cert);
  }

  const loc = (input.location ?? "").toLowerCase();
  const companyLoc = `${company.location ?? ""} ${company.country ?? ""}`.toLowerCase().trim();
  const locationFit = Boolean(
    loc && companyLoc && (loc.includes(companyLoc) || companyLoc.includes(loc) ||
      loc.split(/[^a-z]+/).some((token) => token.length >= 4 && companyLoc.includes(token))),
  );

  const complete = typical.length > 0 && missing.length === 0 && expired.length === 0;
  const score =
    typical.length === 0
      ? locationFit
        ? 40
        : 20
      : Math.max(
          0,
          Math.min(
            100,
            have.length * 28 + (complete ? 16 : 0) + (locationFit ? 10 : 0) - expired.length * 12,
          ),
        );
  const verdict: CompanyMatch["verdict"] = complete
    ? "strong"
    : have.length > 0
      ? "possible"
      : "weak";

  return {
    have,
    missing,
    expired,
    locationFit,
    score,
    verdict,
    canApply: Boolean(company.apply_email?.trim()),
  };
}

export function formatCompanyMatchReason(match: CompanyMatch) {
  const parts: string[] = [];
  if (match.have.length) parts.push(`Current: ${match.have.join(", ")}`);
  if (match.expired.length) parts.push(`Expired: ${match.expired.join(", ")}`);
  if (match.missing.length) parts.push(`Typical tickets missing: ${match.missing.join(", ")}`);
  if (!parts.length) parts.push("No typical tickets listed for this company");
  if (!match.canApply) parts.push("No verified apply email yet — browse only");
  else if (match.missing.length || match.expired.length) {
    parts.push("Apply allowed with warn — pack still sends after clear yes");
  }
  return `${parts.join(". ")}.`;
}

export function companyApplicationDraft(
  company: Pick<DivingCompany, "name" | "location" | "apply_email">,
  displayName: string,
) {
  const to = company.apply_email!.trim().toLowerCase();
  const subject = `Application: commercial diver — ${displayName}`;
  const body = [
    "Hello,",
    "",
    `Please consider my application as a commercial diver for opportunities at ${company.name}${
      company.location ? ` (${company.location})` : ""
    }.`,
    "",
    "I am attaching my current CV and certificate pack.",
    "",
    "Kind regards,",
    displayName,
  ].join("\n");
  return { to, subject, body };
}

export async function listDivingCompanies(
  supabase: SupabaseClient,
  options?: {
    status?: DivingCompanyStatus | "all";
    country?: string;
    scope?: DivingCompanyScope;
    hire_graduates?: boolean;
    search?: string;
    has_apply_email?: boolean;
    limit?: number;
  },
): Promise<DivingCompany[]> {
  let query = supabase
    .from("diving_companies")
    .select(COMPANY_COLUMNS)
    .order("hire_graduates", { ascending: false })
    .order("name", { ascending: true });

  if (options?.status === "all") {
    // no status filter
  } else if (options?.status) {
    query = query.eq("status", options.status);
  } else {
    query = query.eq("status", "active");
  }

  if (options?.country?.trim()) {
    query = query.ilike("country", `%${options.country.trim()}%`);
  }
  if (options?.scope) {
    query = query.contains("scopes", [options.scope]);
  }
  if (typeof options?.hire_graduates === "boolean") {
    query = query.eq("hire_graduates", options.hire_graduates);
  }
  if (options?.has_apply_email === true) {
    query = query.not("apply_email", "is", null);
  } else if (options?.has_apply_email === false) {
    query = query.is("apply_email", null);
  }
  if (options?.search?.trim()) {
    const q = options.search.trim();
    query = query.or(
      `name.ilike.%${q}%,slug.ilike.%${q}%,country.ilike.%${q}%,location.ilike.%${q}%,notes.ilike.%${q}%`,
    );
  }

  const limit = options?.limit ?? 40;
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as DivingCompany[];
}

export async function getDivingCompanyByRef(
  supabase: SupabaseClient,
  ref: string,
): Promise<DivingCompany | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const bySlug = await supabase
    .from("diving_companies")
    .select(COMPANY_COLUMNS)
    .eq("slug", trimmed.toLowerCase())
    .maybeSingle();
  if (bySlug.error) throw new Error(bySlug.error.message);
  if (bySlug.data) return bySlug.data as DivingCompany;

  const byName = await supabase
    .from("diving_companies")
    .select(COMPANY_COLUMNS)
    .ilike("name", `%${trimmed}%`)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (byName.error) throw new Error(byName.error.message);
  return (byName.data as DivingCompany | null) ?? null;
}

export async function updateDivingCompany(
  supabase: SupabaseClient,
  ref: string,
  patch: {
    status?: DivingCompanyStatus;
    name?: string;
    country?: string | null;
    location?: string | null;
    website?: string | null;
    scopes?: string[];
    typical_certs?: string[];
    notes?: string | null;
    hire_graduates?: boolean;
    apply_email?: string | null;
  },
) {
  const existing = await getDivingCompanyByRef(supabase, ref);
  if (!existing) {
    return { ok: false as const, error: `No diving company matched "${ref}".` };
  }

  const cleaned: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status !== undefined) cleaned.status = patch.status;
  if (patch.name !== undefined) cleaned.name = patch.name.trim();
  if (patch.country !== undefined) cleaned.country = patch.country?.trim() || null;
  if (patch.location !== undefined) cleaned.location = patch.location?.trim() || null;
  if (patch.website !== undefined) cleaned.website = patch.website?.trim() || null;
  if (patch.scopes !== undefined) cleaned.scopes = patch.scopes;
  if (patch.typical_certs !== undefined) cleaned.typical_certs = patch.typical_certs;
  if (patch.notes !== undefined) cleaned.notes = patch.notes?.trim() || null;
  if (patch.hire_graduates !== undefined) cleaned.hire_graduates = patch.hire_graduates;
  if (patch.apply_email !== undefined) {
    const email = patch.apply_email?.trim().toLowerCase() || null;
    cleaned.apply_email = email;
  }

  const { data, error } = await supabase
    .from("diving_companies")
    .update(cleaned)
    .eq("id", existing.id)
    .select(COMPANY_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { ok: true as const, company: data as DivingCompany };
}

export async function addDivingCompany(
  supabase: SupabaseClient,
  input: {
    name: string;
    slug?: string;
    country?: string | null;
    location?: string | null;
    website?: string | null;
    scopes?: string[];
    typical_certs?: string[];
    notes?: string | null;
    hire_graduates?: boolean;
    apply_email?: string | null;
  },
) {
  const slug = input.slug?.trim().toLowerCase() || slugify(input.name);
  const applyEmail = input.apply_email?.trim().toLowerCase() || null;

  const { data, error } = await supabase
    .from("diving_companies")
    .insert({
      slug,
      name: input.name.trim(),
      country: input.country?.trim() || null,
      location: input.location?.trim() || null,
      website: input.website?.trim() || null,
      scopes: input.scopes ?? [],
      typical_certs: input.typical_certs ?? [],
      notes: input.notes?.trim() || null,
      hire_graduates: input.hire_graduates ?? false,
      apply_email: applyEmail,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .select(COMPANY_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.message.includes("diving_companies_slug_key")) {
      return { ok: false as const, error: `Slug "${slug}" already exists.` };
    }
    throw new Error(error.message);
  }
  return { ok: true as const, company: data as DivingCompany };
}
