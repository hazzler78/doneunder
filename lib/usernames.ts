import type { SupabaseClient } from "@supabase/supabase-js";

const DEMO_EMAIL_SUFFIX = "@demo.doneunder.ai";

export function normalizeUsername(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Public ambassador slug: 3–30 chars, no email addresses. Dots allowed (dc.inhelder). */
export function isValidPublicUsername(value?: string | null) {
  const username = normalizeUsername(value);
  if (!username) return false;
  if (username.includes("@")) return false;
  if (username.startsWith(".") || username.endsWith(".") || username.includes("..")) return false;
  return /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$|^[a-z0-9]{3}$/.test(username) && username.length <= 30;
}

/**
 * Turn an email local-part or messy handle into a public slug.
 * From email: dots become hyphens (`kaya.diver@…` → `kaya-diver`).
 * Existing handles with dots stay as-is when already valid.
 */
export function slugifyPublicUsername(value?: string | null) {
  let raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  const fromEmail = raw.includes("@");
  if (fromEmail) raw = raw.slice(0, raw.indexOf("@"));
  if (!fromEmail && isValidPublicUsername(raw)) return raw;
  const slug = raw
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return isValidPublicUsername(slug) ? slug : null;
}

/** Demo/test handles stay off Google and the homepage. */
export function isIndexableAmbassadorUsername(username?: string | null) {
  const handle = normalizeUsername(username);
  if (!handle) return false;
  return !handle.endsWith("-demo") && !handle.endsWith("-test");
}

export function preferredUsernameFromIdentity(input: {
  metadataUsername?: string | null;
  email?: string | null;
}) {
  const fromMeta = slugifyPublicUsername(input.metadataUsername);
  if (fromMeta) return fromMeta;

  const email = input.email?.trim().toLowerCase();
  if (!email || email.endsWith(DEMO_EMAIL_SUFFIX)) return null;
  return slugifyPublicUsername(email);
}

function isFallbackUsername(username: string | null, userId: string) {
  if (!username) return true;
  return username === `diver-${userId.slice(0, 8)}` || username.startsWith("diver-");
}

/**
 * Give the signed-in diver their preferred public username (email local-part or
 * metadata). If a demo seed account is squatting on that slug, rename the demo.
 */
export async function claimPreferredUsername(
  supabase: SupabaseClient,
  input: {
    userId: string;
    email?: string | null;
    currentUsername?: string | null;
    metadataUsername?: string | null;
  },
): Promise<string | null> {
  const preferred = preferredUsernameFromIdentity({
    metadataUsername: input.metadataUsername,
    email: input.email,
  });
  const current = normalizeUsername(input.currentUsername);
  if (!preferred) return current;
  if (current === preferred) return current;
  if (current && isValidPublicUsername(current) && !isFallbackUsername(current, input.userId)) {
    return current;
  }

  const { data: holder, error: lookupError } = await supabase
    .from("users")
    .select("id, email")
    .eq("username", preferred)
    .maybeSingle();
  if (lookupError) {
    console.error("Username lookup failed:", lookupError.message);
    return current;
  }

  if (holder && holder.id !== input.userId) {
    const holderEmail = holder.email?.trim().toLowerCase() ?? "";
    if (!holderEmail.endsWith(DEMO_EMAIL_SUFFIX)) return current;

    const { error: renameError } = await supabase
      .from("users")
      .update({ username: `${preferred}-demo`.slice(0, 30) })
      .eq("id", holder.id);
    if (renameError) {
      console.error("Failed to free demo username:", renameError.message);
      return current;
    }
  }

  const { error } = await supabase.from("users").update({ username: preferred }).eq("id", input.userId);
  if (error) {
    console.error("Failed to claim preferred username:", error.message);
    return current;
  }
  return preferred;
}

/** Repair email-as-username or other invalid public handles to a free valid slug. */
export async function repairInvalidPublicUsername(
  supabase: SupabaseClient,
  input: { userId: string; email?: string | null; currentUsername?: string | null },
): Promise<{ ok: true; from: string | null; to: string } | { ok: false; reason: string }> {
  const current = normalizeUsername(input.currentUsername);
  if (current && isValidPublicUsername(current)) {
    return { ok: false, reason: "already_valid" };
  }
  // Only auto-repair clear email slugs or empty/broken handles — not stylistic dots we already allow.
  if (current && !current.includes("@") && !current.startsWith("diver-")) {
    // Still invalid for another reason; attempt slugify
  }

  const base =
    slugifyPublicUsername(current) ||
    preferredUsernameFromIdentity({ email: input.email }) ||
    `diver-${input.userId.replace(/-/g, "").slice(0, 8)}`;

  let candidate = base;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: holder } = await supabase
      .from("users")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    if (!holder || holder.id === input.userId) {
      const { error } = await supabase.from("users").update({ username: candidate }).eq("id", input.userId);
      if (error) return { ok: false, reason: error.message };
      return { ok: true, from: current, to: candidate };
    }
    const suffix = `-${attempt + 2}`;
    candidate = `${base.slice(0, Math.max(3, 30 - suffix.length))}${suffix}`;
  }
  return { ok: false, reason: "no_free_slug" };
}
