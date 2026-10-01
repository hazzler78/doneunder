import { NextResponse } from "next/server";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { unpublishDiverProfile } from "@/lib/diver-profile-service";

export async function POST() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const result = await unpublishDiverProfile(authResult.supabase, authResult.diverId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      already_draft: result.already_draft,
      profile: result.profile.profile,
    });
  } catch {
    return NextResponse.json({ error: "Unable to unpublish profile." }, { status: 500 });
  }
}
