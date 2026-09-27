import type { SupabaseClient } from "@supabase/supabase-js";

const DEMO_EMAIL_SUFFIX = "@demo.doneunder.ai";

export function normalizeUsername(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** Public ambassador slug: 3–30 chars, no email addresses. */
export function isValidPublicUsername(value?: string | null) {
  const username = normalizeUsername(value);
  if (!username) return false;
  if (username.includes("@")) return false;
  return /^[a-z0-9][a-z0-9_-]{2,29}$/.test(username);
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
  const fromMeta = normalizeUsername(input.metadataUsername);
  if (fromMeta) return fromMeta;

  const email = input.email?.trim().toLowerCase();
  if (!email || email.endsWith(DEMO_EMAIL_SUFFIX)) return null;
  const local = email.split("@")[0]?.trim().toLowerCase();
  return local || null;
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
  if (current && !isFallbackUsername(current, input.userId)) return current;

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
      .update({ username: `${preferred}-demo` })
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
