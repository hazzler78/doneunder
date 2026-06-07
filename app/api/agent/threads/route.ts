import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyHermesAgent } from "@/lib/agent-auth";
import { assertDiverUser } from "@/lib/agent-profile";
import { resolveDiverIdFromThread, upsertAgentThread } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

const threadUpsertSchema = z.object({
  diver_id: z.string().uuid(),
  channel: z.enum(["telegram", "web"]),
  external_chat_id: z.string().min(1).max(128),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  const auth = verifyHermesAgent(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const externalChatId = url.searchParams.get("external_chat_id");

    if (channel !== "telegram" && channel !== "web") {
      return NextResponse.json({ error: "Query param channel must be telegram or web." }, { status: 400 });
    }
    if (!externalChatId) {
      return NextResponse.json({ error: "Query param external_chat_id is required." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const diverId = await resolveDiverIdFromThread(supabase, channel, externalChatId);
    if (!diverId) {
      return NextResponse.json({ error: "No thread mapping found." }, { status: 404 });
    }

    const { data: user } = await supabase.from("users").select("id, username, email, full_name").eq("id", diverId).maybeSingle();

    return NextResponse.json({
      diver_id: diverId,
      channel,
      external_chat_id: externalChatId,
      user,
    });
  } catch {
    return NextResponse.json({ error: "Unable to resolve agent thread." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = verifyHermesAgent(req);
  if (!auth.ok) return auth.response;

  try {
    const body = threadUpsertSchema.parse(await req.json());
    const supabase = createServiceSupabaseClient();
    const diverCheck = await assertDiverUser(supabase, body.diver_id);
    if (!diverCheck.ok) {
      return NextResponse.json({ error: diverCheck.message }, { status: diverCheck.status });
    }

    const thread = await upsertAgentThread(supabase, {
      diverId: body.diver_id,
      channel: body.channel,
      externalChatId: body.external_chat_id,
      metadata: body.metadata,
    });

    await logAgentInteraction({
      actorId: body.diver_id,
      feature: "hermes_thread_upsert",
      input: body,
      output: { thread_id: thread.id },
    });

    return NextResponse.json({ ok: true, thread });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid thread payload.", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to upsert agent thread." }, { status: 500 });
  }
}
