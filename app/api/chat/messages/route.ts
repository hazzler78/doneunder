import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { listAgentMessages } from "@/lib/agent-messages";
import { getAgentThread } from "@/lib/agent-threads";
import { readPendingInbound } from "@/lib/inbound-email";
import { maybePollReceivedEmails } from "@/lib/inbound-email-process";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const WELCOME_DIVER =
  "Hi — I'm Hermes. Update your CV just by talking, in English. Tell me a job to add, a ticket to list, hours to change, or paste CV text. I'll save it for you.";
const WELCOME_COMPANY =
  "Welcome. I can help draft job requests and shortlist matching diver profiles.";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (userRow?.role as UserRole | undefined) ?? "diver";
    if (role === "admin") {
      return NextResponse.json({ ok: false, error: "Admin workspace is not enabled." }, { status: 403 });
    }

    const service = createServiceSupabaseClient();
    await maybePollReceivedEmails();
    const thread = await getAgentThread(service, "web", user.id);
    const pending = readPendingInbound(thread?.metadata ?? null);
    const pendingInbound =
      pending?.status === "pending"
        ? {
            from: pending.from,
            subject: pending.subject,
            intent: pending.intent,
            status: pending.status,
          }
        : null;

    if (!thread) {
      return NextResponse.json({
        ok: true,
        role,
        pendingInbound,
        messages: [
          {
            id: "welcome",
            role: "assistant",
            content: role === "diver" ? WELCOME_DIVER : WELCOME_COMPANY,
            created_at: new Date().toISOString(),
          },
        ],
      });
    }

    // Read with the service role. agent_threads has no user SELECT policy in
    // older databases, so nested RLS on agent_messages otherwise returns [].
    const stored = await listAgentMessages(service, thread.id, { limit: 80 });
    if (stored.length === 0) {
      return NextResponse.json({
        ok: true,
        role,
        pendingInbound,
        messages: [
          {
            id: "welcome",
            role: "assistant",
            content: role === "diver" ? WELCOME_DIVER : WELCOME_COMPANY,
            created_at: new Date().toISOString(),
          },
        ],
      });
    }

    return NextResponse.json({
      ok: true,
      role,
      pendingInbound,
      messages: stored.map((item) => ({
        id: item.id,
        role: item.role === "user" ? "user" : "assistant",
        content: item.content,
        created_at: item.created_at,
      })),
    });
  } catch (error) {
    console.error("Failed to load chat messages:", error);
    return NextResponse.json({ ok: false, error: "Could not load chat history." }, { status: 500 });
  }
}
