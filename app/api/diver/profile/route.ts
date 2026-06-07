import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { diverProfilePayloadSchema } from "@/lib/diver-profile";
import { getDiverProfile, saveDiverProfile } from "@/lib/diver-profile-service";

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const fullProfile = await getDiverProfile(authResult.supabase, authResult.diverId);

    return NextResponse.json({
      profile: fullProfile.profile,
      experiences: fullProfile.experiences,
      certifications: fullProfile.certifications,
      references: fullProfile.references,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load diver profile." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = diverProfilePayloadSchema.parse(await req.json());
    await saveDiverProfile(authResult.supabase, authResult.diverId, body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload.", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save diver profile." }, { status: 500 });
  }
}
