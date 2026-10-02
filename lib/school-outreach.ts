import type { SupabaseClient } from "@supabase/supabase-js";

export type SchoolOutreachStatus = "todo" | "contacted" | "replied" | "partner" | "skip";
export type SchoolContactChannel = "email" | "phone" | "visit" | "other";

export type SchoolOutreachTarget = {
  id: string;
  slug: string;
  name: string;
  priority: number;
  location: string | null;
  country: string | null;
  website: string | null;
  notes: string | null;
  status: SchoolOutreachStatus;
  contact_name: string | null;
  contact_email: string | null;
  contact_note: string | null;
  last_contacted_at: string | null;
  last_contacted_by: string | null;
  updated_at: string;
};

const TARGET_COLUMNS =
  "id,slug,name,priority,location,country,website,notes,status,contact_name,contact_email,contact_note,last_contacted_at,last_contacted_by,updated_at" as const;

export async function listSchoolOutreachTargets(
  supabase: SupabaseClient,
  options?: {
    status?: SchoolOutreachStatus | "active";
    priority?: number;
    search?: string;
    limit?: number;
  },
): Promise<SchoolOutreachTarget[]> {
  let query = supabase
    .from("school_outreach_targets")
    .select(TARGET_COLUMNS)
    .order("priority", { ascending: true })
    .order("name", { ascending: true });

  if (options?.status === "active") {
    query = query.neq("status", "skip");
  } else if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (typeof options?.priority === "number") {
    query = query.eq("priority", options.priority);
  }
  if (options?.search?.trim()) {
    const q = options.search.trim();
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,country.ilike.%${q}%,location.ilike.%${q}%`);
  }
  const limit = options?.limit ?? 200;
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SchoolOutreachTarget[];
}

export async function getSchoolOutreachTargetByRef(
  supabase: SupabaseClient,
  ref: string,
): Promise<SchoolOutreachTarget | null> {
  const trimmed = ref.trim();
  const bySlug = await supabase
    .from("school_outreach_targets")
    .select(TARGET_COLUMNS)
    .eq("slug", trimmed.toLowerCase())
    .maybeSingle();
  if (bySlug.error) throw new Error(bySlug.error.message);
  if (bySlug.data) return bySlug.data as SchoolOutreachTarget;

  const byName = await supabase
    .from("school_outreach_targets")
    .select(TARGET_COLUMNS)
    .ilike("name", `%${trimmed}%`)
    .limit(1)
    .maybeSingle();
  if (byName.error) throw new Error(byName.error.message);
  return (byName.data as SchoolOutreachTarget | null) ?? null;
}

export async function summarizeSchoolOutreach(supabase: SupabaseClient) {
  const targets = await listSchoolOutreachTargets(supabase, { status: "active", limit: 200 });
  const byStatus: Record<string, number> = {};
  for (const t of targets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }
  const nextTodo = targets.filter((t) => t.status === "todo").slice(0, 8);
  return { totalActive: targets.length, byStatus, nextTodo };
}

export async function updateSchoolOutreachTarget(
  supabase: SupabaseClient,
  ref: string,
  patch: {
    status?: SchoolOutreachStatus;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_note?: string | null;
    notes?: string | null;
    website?: string | null;
    priority?: number;
  },
) {
  const existing = await getSchoolOutreachTargetByRef(supabase, ref);
  if (!existing) {
    return { ok: false as const, error: `No school target matched "${ref}".` };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("school_outreach_targets")
    .update({
      ...patch,
      updated_at: nowIso,
    })
    .eq("id", existing.id)
    .select(TARGET_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { ok: true as const, target: data as SchoolOutreachTarget };
}

export async function logSchoolOutreachContact(
  supabase: SupabaseClient,
  input: {
    userId: string;
    ref: string;
    channel: SchoolContactChannel;
    summary: string;
    contact_email?: string | null;
    set_status?: SchoolOutreachStatus;
  },
) {
  const existing = await getSchoolOutreachTargetByRef(supabase, input.ref);
  if (!existing) {
    return { ok: false as const, error: `No school target matched "${input.ref}".` };
  }

  const nowIso = new Date().toISOString();
  const nextStatus =
    input.set_status ??
    (existing.status === "todo" ? ("contacted" as const) : existing.status);

  const { error: logError } = await supabase.from("school_outreach_contacts").insert({
    target_id: existing.id,
    contacted_by: input.userId,
    channel: input.channel,
    summary: input.summary.trim(),
    contact_email: input.contact_email?.trim() || null,
  });
  if (logError) throw new Error(logError.message);

  const { data, error } = await supabase
    .from("school_outreach_targets")
    .update({
      status: nextStatus,
      last_contacted_at: nowIso,
      last_contacted_by: input.userId,
      contact_email: input.contact_email?.trim() || existing.contact_email,
      updated_at: nowIso,
    })
    .eq("id", existing.id)
    .select(TARGET_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return { ok: true as const, target: data as SchoolOutreachTarget, status: nextStatus };
}

export async function addSchoolOutreachTarget(
  supabase: SupabaseClient,
  input: {
    name: string;
    slug?: string;
    priority?: number;
    location?: string | null;
    country?: string | null;
    website?: string | null;
    notes?: string | null;
  },
) {
  const slug =
    input.slug?.trim().toLowerCase() ||
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

  const { data, error } = await supabase
    .from("school_outreach_targets")
    .insert({
      slug,
      name: input.name.trim(),
      priority: input.priority ?? 2,
      location: input.location?.trim() || null,
      country: input.country?.trim() || null,
      website: input.website?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "todo",
      updated_at: new Date().toISOString(),
    })
    .select(TARGET_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.message.includes("school_outreach_targets_slug_key")) {
      return { ok: false as const, error: `Slug "${slug}" already exists.` };
    }
    throw new Error(error.message);
  }
  return { ok: true as const, target: data as SchoolOutreachTarget };
}
