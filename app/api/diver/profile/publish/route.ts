import { NextResponse } from "next/server";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { publishDiverProfile } from "@/lib/diver-profile-service";

export async function POST() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const result = await publishDiverProfile(authResult.supabase, authResult.diverId);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Profile is not ready to publish.",
          validation: result.validation,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      validation: result.validation,
      profile: result.profile.profile,
    });
  } catch {
    return NextResponse.json({ error: "Unable to publish profile." }, { status: 500 });
  }
}
