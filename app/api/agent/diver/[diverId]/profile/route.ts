import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentSourceRef, verifyHermesAgent } from "@/lib/agent-auth";
import { assertDiverUser } from "@/lib/agent-profile";
import { touchAgentThread } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { diverProfilePatchSchema } from "@/lib/diver-profile";
import { getDiverProfile, patchDiverProfile, validateDiverProfile } from "@/lib/diver-profile-service";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ diverId: string }> };

function applyAgentSourceDefaults(
  patch: z.infer<typeof diverProfilePatchSchema>,
  sourceRef: string | null,
) {
  if (!sourceRef) return patch;

  const next = { ...patch };
  if (patch.headline !== undefined) {
    next.headline_source = patch.headline_source ?? "ai";
    next.headline_source_ref = patch.headline_source_ref ?? sourceRef;
  }
  if (patch.bio !== undefined) {
    next.bio_source = patch.bio_source ?? "ai";
    next.bio_source_ref = patch.bio_source_ref ?? sourceRef;
  }
  if (patch.experiences !== undefined) {
    next.experiences = patch.experiences.map((item) => ({
      ...item,
      source: item.source ?? "ai",
      source_ref: item.source_ref ?? sourceRef,
    }));
  }
  if (patch.certifications !== undefined) {
    next.certifications = patch.certifications.map((item) => ({
      ...item,
      source: item.source ?? "ai",
      source_ref: item.source_ref ?? sourceRef,
    }));
  }
  if (patch.references !== undefined) {
    next.references = patch.references.map((item) => ({
      ...item,
      source: item.source ?? "ai",
      source_ref: item.source_ref ?? sourceRef,
    }));
  }
  return next;
}

export async function GET(req: Request, context: RouteContext) {
  const auth = verifyHermesAgent(req);
  if (!auth.ok) return auth.response;

  try {
    const { diverId } = await context.params;
    const supabase = createServiceSupabaseClient();
    const diverCheck = await assertDiverUser(supabase, diverId);
    if (!diverCheck.ok) {
      return NextResponse.json({ error: diverCheck.message }, { status: diverCheck.status });
    }

    const fullProfile = await getDiverProfile(supabase, diverId);
    const validation = validateDiverProfile({
      headline: fullProfile.profile.headline,
      bio: fullProfile.profile.bio,
      location: fullProfile.profile.location,
      mobilization_notice: fullProfile.profile.mobilization_notice,
      availability_status: fullProfile.profile.availability_status,
      sat_hours: fullProfile.profile.sat_hours,
      dive_hours: fullProfile.profile.dive_hours,
      polished_cv_markdown: fullProfile.profile.polished_cv_markdown ?? undefined,
      polished_cv_json: fullProfile.profile.polished_cv_json,
      ambassador_public_headline: fullProfile.profile.ambassador_public_headline ?? undefined,
      ambassador_short_bio: fullProfile.profile.ambassador_short_bio ?? undefined,
      ambassador_key_highlights: fullProfile.profile.ambassador_key_highlights,
      experiences: fullProfile.experiences,
      certifications: fullProfile.certifications,
      references: fullProfile.references,
    });

    await logAgentInteraction({
      actorId: diverId,
      feature: "hermes_profile_get",
      input: { diverId },
      output: { profile_status: fullProfile.profile.profile_status, validation },
    });

    return NextResponse.json({
      diver: diverCheck.user,
      profile: fullProfile.profile,
      experiences: fullProfile.experiences,
      certifications: fullProfile.certifications,
      references: fullProfile.references,
      validation,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load diver profile for agent." }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const auth = verifyHermesAgent(req);
  if (!auth.ok) return auth.response;

  try {
    const { diverId } = await context.params;
    const supabase = createServiceSupabaseClient();
    const diverCheck = await assertDiverUser(supabase, diverId);
    if (!diverCheck.ok) {
      return NextResponse.json({ error: diverCheck.message }, { status: diverCheck.status });
    }

    const rawPatch = diverProfilePatchSchema.parse(await req.json());
    const sourceRef = getAgentSourceRef(req);
    const patch = applyAgentSourceDefaults(rawPatch, sourceRef);
    const updated = await patchDiverProfile(supabase, diverId, patch);

    const channel = req.headers.get("x-hermes-channel");
    const externalChatId = req.headers.get("x-hermes-external-chat-id");
    if (channel === "telegram" || channel === "web") {
      if (externalChatId) {
        await touchAgentThread(supabase, channel, externalChatId);
      }
    }

    const validation = validateDiverProfile({
      headline: updated.profile.headline,
      bio: updated.profile.bio,
      location: updated.profile.location,
      mobilization_notice: updated.profile.mobilization_notice,
      availability_status: updated.profile.availability_status,
      sat_hours: updated.profile.sat_hours,
      dive_hours: updated.profile.dive_hours,
      polished_cv_markdown: updated.profile.polished_cv_markdown ?? undefined,
      polished_cv_json: updated.profile.polished_cv_json,
      ambassador_public_headline: updated.profile.ambassador_public_headline ?? undefined,
      ambassador_short_bio: updated.profile.ambassador_short_bio ?? undefined,
      ambassador_key_highlights: updated.profile.ambassador_key_highlights,
      experiences: updated.experiences,
      certifications: updated.certifications,
      references: updated.references,
    });

    await logAgentInteraction({
      actorId: diverId,
      feature: "hermes_profile_patch",
      input: { diverId, patch, sourceRef },
      output: { profile_status: updated.profile.profile_status, validation },
    });

    return NextResponse.json({
      ok: true,
      profile: updated.profile,
      experiences: updated.experiences,
      certifications: updated.certifications,
      references: updated.references,
      validation,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid patch payload.", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to patch diver profile for agent." }, { status: 500 });
  }
}
