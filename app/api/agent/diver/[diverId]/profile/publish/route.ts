import { NextResponse } from "next/server";
import { getAgentSourceRef, verifyHermesAgent } from "@/lib/agent-auth";
import { assertDiverUser } from "@/lib/agent-profile";
import { touchAgentThread } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { publishDiverProfile } from "@/lib/diver-profile-service";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ diverId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const auth = verifyHermesAgent(req);
  if (!auth.ok) return auth.response;

  try {
    const { diverId } = await context.params;
    const supabase = createServiceSupabaseClient();
    const diverCheck = await assertDiverUser(supabase, diverId);
    if (!diverCheck.ok) {
      return NextResponse.json({ error: diverCheck.message }, { status: diverCheck.status });
    }

    const result = await publishDiverProfile(supabase, diverId);

    const channel = req.headers.get("x-hermes-channel");
    const externalChatId = req.headers.get("x-hermes-external-chat-id");
    if ((channel === "telegram" || channel === "web") && externalChatId) {
      await touchAgentThread(supabase, channel, externalChatId);
    }

    await logAgentInteraction({
      actorId: diverId,
      feature: "hermes_profile_publish",
      input: { diverId, sourceRef: getAgentSourceRef(req) },
      output: { ok: result.ok, validation: result.validation, profile_status: result.profile.profile.profile_status },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Profile is not ready to publish.",
          validation: result.validation,
          profile: result.profile.profile,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      validation: result.validation,
      profile: result.profile.profile,
      ambassador_url: diverCheck.user.username ? `/${diverCheck.user.username}` : null,
    });
  } catch {
    return NextResponse.json({ error: "Unable to publish diver profile for agent." }, { status: 500 });
  }
}
