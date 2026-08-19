import { NextResponse } from "next/server";
import { ensureDiverProfileForAuthUser } from "@/lib/diver-bootstrap";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type { AppUserRecord } from "@/lib/diver-bootstrap";
export { ensureDiverProfileForAuthUser } from "@/lib/diver-bootstrap";

export type AuthenticatedDiverContext = {
  diverId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
};

export type AuthResult = AuthenticatedDiverContext | { error: NextResponse };

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
