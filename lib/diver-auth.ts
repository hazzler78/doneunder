import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { claimPreferredUsername } from "@/lib/usernames";

export type AuthenticatedDiverContext = {
  diverId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
};

export type AuthResult = AuthenticatedDiverContext | { error: NextResponse };

function createServiceSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Ensures the session user exists in public.users with role diver. */
export async function getAuthenticatedDiverContext(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const serviceSupabase = createServiceSupabase();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let { data: userRecord } = await serviceSupabase
    .from("users")
    .select("id, role, full_name, username")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!userRecord) {
    const fullName =
      (auth.user.user_metadata?.full_name as string | undefined)?.trim() ||
      (auth.user.email ? auth.user.email.split("@")[0] : "Diver");
    const username =
      (auth.user.user_metadata?.username as string | undefined)?.trim().toLowerCase() ||
      (auth.user.email ? auth.user.email.split("@")[0].toLowerCase() : `diver-${auth.user.id.slice(0, 8)}`);

    const { data: inserted, error: insertError } = await serviceSupabase
      .from("users")
      .upsert(
        {
          id: auth.user.id,
          role: "diver",
          email: auth.user.email ?? `${auth.user.id}@placeholder.local`,
          username,
          full_name: fullName,
        },
        { onConflict: "id" },
      )
      .select("id, role, full_name, username")
      .maybeSingle();

    if (!insertError) {
      userRecord = inserted ?? null;
    }
  }

  if (userRecord) {
    const claimed = await claimPreferredUsername(serviceSupabase, {
      userId: auth.user.id,
      email: auth.user.email,
      currentUsername: userRecord.username,
      metadataUsername:
        typeof auth.user.user_metadata?.username === "string" ? auth.user.user_metadata.username : null,
    });
    if (claimed && claimed !== userRecord.username) {
      userRecord = { ...userRecord, username: claimed };
    }
  }

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
