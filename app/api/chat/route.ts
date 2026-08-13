import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { agentMessagesToChatHistory, appendAgentTurn, listAgentMessages } from "@/lib/agent-messages";
import { ensureWorkspaceWebThread, mergeAgentThreadMetadata } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { runHermesDiverTurn } from "@/lib/hermes-diver-agent";
import { readPendingInbound } from "@/lib/inbound-email";
import { maybePollReceivedEmails } from "@/lib/inbound-email-process";
import type { UserRole } from "@/lib/types";
import { claimPreferredUsername } from "@/lib/usernames";

const chatSchema = z.object({
  message: z.string().min(1).max(16000),
});

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, reply: "Please sign in first." }, { status: 401 });
    }

    const body = chatSchema.parse(await req.json());
    const message = body.message.trim();

    let { data: userRow } = await supabase
      .from("users")
      .select("id, role, full_name, username, email")
      .eq("id", user.id)
      .maybeSingle();

    const service = createServiceSupabaseClient();
    if (!userRow) {
      const fullName =
        (user.user_metadata?.full_name as string | undefined)?.trim() ||
        (user.email ? user.email.split("@")[0] : "Diver");
      const username =
        (user.user_metadata?.username as string | undefined)?.trim().toLowerCase() ||
        (user.email ? user.email.split("@")[0].toLowerCase() : `diver-${user.id.slice(0, 8)}`);

      const createUserPayload = (resolvedUsername: string) => ({
        id: user.id,
        role: "diver" as const,
        email: user.email ?? `${user.id}@placeholder.local`,
        username: resolvedUsername,
        full_name: fullName,
      });

      let { data: insertedUser, error: upsertUserError } = await service
        .from("users")
        .upsert(createUserPayload(username), { onConflict: "id" })
        .select("id, role, full_name, username, email")
        .maybeSingle();

      if (upsertUserError?.message.includes("users_username_key")) {
        const fallbackUsername = `diver-${user.id.slice(0, 8)}`;
        const retry = await service
          .from("users")
          .upsert(createUserPayload(fallbackUsername), { onConflict: "id" })
          .select("id, role, full_name, username, email")
          .maybeSingle();
        insertedUser = retry.data ?? insertedUser;
        upsertUserError = retry.error ?? null;
      }

      if (upsertUserError) {
        return NextResponse.json(
          { ok: false, reply: `Could not initialize user context for chat: ${upsertUserError.message}` },
          { status: 500 },
        );
      }
      userRow = insertedUser ?? null;
    }

    if (userRow && ((userRow.role as UserRole | undefined) ?? "diver") === "diver") {
      const claimed = await claimPreferredUsername(service, {
        userId: user.id,
        email: userRow.email ?? user.email,
        currentUsername: userRow.username,
        metadataUsername: typeof user.user_metadata?.username === "string" ? user.user_metadata.username : null,
      });
      if (claimed && claimed !== userRow.username) {
        userRow = { ...userRow, username: claimed };
      }
    }

    const role = (userRow?.role as UserRole | undefined) ?? "diver";
    if (role === "admin") {
      return NextResponse.json({ ok: false, reply: "Admin chat workspace is not enabled yet." }, { status: 403 });
    }

    const workspaceRole = role === "company" ? "company" : "diver";
    if (workspaceRole === "diver") {
      await maybePollReceivedEmails();
    }
    let thread: Awaited<ReturnType<typeof ensureWorkspaceWebThread>> | null = null;
    let history: ReturnType<typeof agentMessagesToChatHistory> = [];

    try {
      thread = await ensureWorkspaceWebThread(service, user.id, workspaceRole);
      const priorMessages = await listAgentMessages(service, thread.id, { limit: 30 });
      history = agentMessagesToChatHistory(priorMessages);
    } catch (memoryError) {
      console.error("Agent memory unavailable:", memoryError);
    }

    if (role === "company") {
      const reply =
        "Company workspace is live. Next, I can wire candidate screening and job drafting tools to this chat. For now, ask me for screening criteria and I will keep it scoped to your company session.";
      if (thread) {
        try {
          await appendAgentTurn(service, {
            threadId: thread.id,
            userContent: message,
            assistantContent: reply,
          });
        } catch (persistError) {
          console.error("Failed to persist company chat turn:", persistError);
        }
      }
      await logAgentInteraction({
        actorId: user.id,
        feature: "web_chat_company_message",
        input: { message, threadId: thread?.id ?? null },
        output: { reply },
      });
      return NextResponse.json({ ok: true, role, reply });
    }

    const pendingInbound = readPendingInbound(thread?.metadata ?? null);
    const agentResult = await runHermesDiverTurn({
      supabase: service,
      diverId: user.id,
      username: userRow?.username ?? null,
      displayName: userRow?.full_name ?? "Diver",
      userEmail: userRow?.email ?? user.email ?? null,
      message,
      history,
      pendingInbound,
    });

    if (thread) {
      try {
        await appendAgentTurn(service, {
          threadId: thread.id,
          userContent: message,
          assistantContent: agentResult.reply,
        });
      } catch (persistError) {
        console.error("Failed to persist diver chat turn:", persistError);
      }
    }

    if (thread && pendingInbound && agentResult.pendingInboundStatus) {
      try {
        await mergeAgentThreadMetadata(service, thread.id, {
          pending_inbound: {
            ...pendingInbound,
            status: agentResult.pendingInboundStatus,
          },
        });
      } catch (pendingError) {
        console.error("Failed to update pending inbound status:", pendingError);
      }
    }

    await logAgentInteraction({
      actorId: user.id,
      feature: "web_chat_diver_message",
      input: { message, threadId: thread?.id ?? null, historyLength: history.length },
      output: {
        reply: agentResult.reply,
        suggestionsCount: agentResult.suggestions.length,
        cvUpdated: agentResult.cvUpdated,
        updatedParts: agentResult.updatedParts,
      },
    });

    return NextResponse.json({
      ok: true,
      role,
      reply: agentResult.reply,
      suggestions: agentResult.suggestions,
      profileStatus: agentResult.profile.profile.profile_status,
      cvUpdated: agentResult.cvUpdated,
      updatedParts: agentResult.updatedParts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, reply: "Invalid chat request payload.", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("Chat agent error:", error);
    return NextResponse.json({ ok: false, reply: "Chat agent failed to process your message." }, { status: 500 });
  }
}
