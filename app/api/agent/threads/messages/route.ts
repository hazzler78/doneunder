import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyHermesAgent } from "@/lib/agent-auth";
import { appendAgentMessage, listAgentMessages } from "@/lib/agent-messages";
import { getAgentThread, touchAgentThread } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

const messageAppendSchema = z.object({
  channel: z.enum(["telegram", "web"]),
  external_chat_id: z.string().min(1).max(128),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request) {
  const auth = verifyHermesAgent(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const externalChatId = url.searchParams.get("external_chat_id");
    const limit = Number(url.searchParams.get("limit") ?? "40");

    if (channel !== "telegram" && channel !== "web") {
      return NextResponse.json({ error: "Query param channel must be telegram or web." }, { status: 400 });
    }
    if (!externalChatId) {
      return NextResponse.json({ error: "Query param external_chat_id is required." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();
    const thread = await getAgentThread(supabase, channel, externalChatId);
    if (!thread) {
      return NextResponse.json({ error: "No thread mapping found." }, { status: 404 });
    }

    const messages = await listAgentMessages(supabase, thread.id, {
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 40,
    });

    return NextResponse.json({
      thread_id: thread.id,
      user_id: thread.user_id,
      diver_id: thread.diver_id,
      messages,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load agent messages." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = verifyHermesAgent(req);
  if (!auth.ok) return auth.response;

  try {
    const body = messageAppendSchema.parse(await req.json());
    const supabase = createServiceSupabaseClient();
    const thread = await getAgentThread(supabase, body.channel, body.external_chat_id);
    if (!thread) {
      return NextResponse.json({ error: "No thread mapping found." }, { status: 404 });
    }

    const message = await appendAgentMessage(supabase, {
      threadId: thread.id,
      role: body.role,
      content: body.content,
      metadata: body.metadata,
    });

    await touchAgentThread(supabase, body.channel, body.external_chat_id);

    await logAgentInteraction({
      actorId: thread.user_id,
      feature: "hermes_message_append",
      input: { channel: body.channel, external_chat_id: body.external_chat_id, role: body.role },
      output: { message_id: message.id, thread_id: thread.id },
    });

    return NextResponse.json({ ok: true, message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid message payload.", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to append agent message." }, { status: 500 });
  }
}
