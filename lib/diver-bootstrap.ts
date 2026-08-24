import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { claimPreferredUsername } from "@/lib/usernames";

export type AppUserRecord = {
  id: string;
  role: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
};

export function metadataString(user: Pick<User, "user_metadata">, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function diverFieldsFromAuthUser(user: User, existing?: AppUserRecord | null) {
  const fullName =
    metadataString(user, "full_name") ||
    metadataString(user, "name") ||
    existing?.full_name?.trim() ||
    (user.email ? user.email.split("@")[0] : "Diver");
  const email = user.email ?? existing?.email ?? `${user.id}@placeholder.local`;
  const metadataUsername =
    metadataString(user, "username") ||
    metadataString(user, "user_name") ||
    metadataString(user, "preferred_username") ||
    null;

  return {
    fullName,
    email,
    metadataUsername,
    insert: {
      id: user.id,
      role: "diver" as const,
      email,
      username: `diver-${user.id.slice(0, 8)}`,
      full_name: fullName,
    },
  };
}

/**
 * New Google/email users become divers. Existing company/admin roles are left alone.
 */
/** agent_threads.diver_id points at diver_profiles.user_id, not public.users. */
export async function ensureDiverProfileRow(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from("diver_profiles").upsert({ user_id: userId }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function ensureDiverProfileForAuthUser(user: User): Promise<AppUserRecord | null> {
  let admin;
  try {
    admin = createServiceSupabaseClient();
  } catch {
    return null;
  }

  const { data: existing } = await admin
    .from("users")
    .select("id, role, full_name, username, email")
    .eq("id", user.id)
    .maybeSingle();

  const fields = diverFieldsFromAuthUser(user, existing);
  let record: AppUserRecord | null = existing ?? null;

  if (!record) {
    const { data: inserted, error: insertError } = await admin
      .from("users")
      .upsert(fields.insert, { onConflict: "id" })
      .select("id, role, full_name, username, email")
      .maybeSingle();

    if (insertError) {
      console.error("Failed to create diver profile:", insertError.message);
      return null;
    }
    record = inserted ?? null;
  }

  if (record && record.role === "diver") {
    try {
      await ensureDiverProfileRow(admin, user.id);
    } catch (error) {
      console.error("Failed to create diver_profiles row:", error);
    }
    const claimed = await claimPreferredUsername(admin, {
      userId: user.id,
      email: fields.email,
      currentUsername: record.username,
      metadataUsername: fields.metadataUsername,
    });
    if (claimed && claimed !== record.username) {
      record = { ...record, username: claimed };
    }
  }

  return record;
}
