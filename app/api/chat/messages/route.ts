import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { listAgentMessages } from "@/lib/agent-messages";
import { getAgentThread } from "@/lib/agent-threads";
import type { UserRole } from "@/lib/types";

const WELCOME_DIVER =
  "Hi — I'm Hermes. Upload your CV on the left, then just talk to me naturally: review your profile, tweak your headline, or find matching jobs.";
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
    const thread = await getAgentThread(service, "web", user.id);
    if (!thread) {
      return NextResponse.json({
        ok: true,
        role,
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

    const stored = await listAgentMessages(supabase, thread.id, { limit: 80 });
    if (stored.length === 0) {
      return NextResponse.json({
        ok: true,
        role,
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
