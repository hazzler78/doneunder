import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimPreferredUsername } from "@/lib/usernames";

export type AuthenticatedDiverContext = {
  diverId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
};

export type AuthResult = AuthenticatedDiverContext | { error: NextResponse };

export type AppUserRecord = {
  id: string;
  role: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
};

function metadataString(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * New Google/email users become divers. Existing company/admin roles are left alone.
 */
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

  let record: AppUserRecord | null = existing ?? null;

  if (!record) {
    const { data: inserted, error: insertError } = await admin
      .from("users")
      .upsert(
        {
          id: user.id,
          role: "diver",
          email,
          username: `diver-${user.id.slice(0, 8)}`,
          full_name: fullName,
        },
        { onConflict: "id" },
      )
      .select("id, role, full_name, username, email")
      .maybeSingle();

    if (insertError) {
      console.error("Failed to create diver profile:", insertError.message);
      return null;
    }
    record = inserted ?? null;
  }

  if (record && record.role === "diver") {
    const claimed = await claimPreferredUsername(admin, {
      userId: user.id,
      email,
      currentUsername: record.username,
      metadataUsername,
    });
    if (claimed && claimed !== record.username) {
      record = { ...record, username: claimed };
    }
  }

  return record;
}

/** Ensures the session user exists in public.users with role diver. */
export async function getAuthenticatedDiverContext(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const userRecord = await ensureDiverProfileForAuthUser(auth.user);

  if (userRecord && userRecord.role !== "diver") {
    return {
      error: NextResponse.json(
        { error: "Forbidden. This endpoint requires a diver account." },
        { status: 403 },
      ),
    };
  }

  return { diverId: auth.user.id, supabase };
}
