import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAgentThread, upsertAgentThread } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { runHermesDiverTurn } from "@/lib/hermes-diver-agent";
import type { UserRole } from "@/lib/types";

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(24)
    .optional(),
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
      .select("id, role, full_name, username")
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
        .select("id, role, full_name, username")
        .maybeSingle();

      if (upsertUserError?.message.includes("users_username_key")) {
        const fallbackUsername = `diver-${user.id.slice(0, 8)}`;
        const retry = await service
          .from("users")
          .upsert(createUserPayload(fallbackUsername), { onConflict: "id" })
          .select("id, role, full_name, username")
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

    const role = (userRow?.role as UserRole | undefined) ?? "diver";
    if (role === "admin") {
      return NextResponse.json({ ok: false, reply: "Admin chat workspace is not enabled yet." }, { status: 403 });
    }

    if (role === "company") {
      const threadId = `company-web-${user.id}`;
      const reply =
        "Company workspace is live. Next, I can wire candidate screening and job drafting tools to this chat. For now, ask me for screening criteria and I will keep it scoped to your company session.";
      await logAgentInteraction({
        actorId: user.id,
        feature: "web_chat_company_message",
        input: { message, threadId },
        output: { reply },
      });
      return NextResponse.json({ ok: true, role, reply });
    }

    const { error: ensureProfileError } = await service
      .from("diver_profiles")
      .upsert({ user_id: user.id }, { onConflict: "user_id" });
    if (ensureProfileError) {
      return NextResponse.json(
        { ok: false, reply: `Could not initialize diver profile context for chat: ${ensureProfileError.message}` },
        { status: 500 },
      );
    }

    const externalChatId = user.id;
    const channel = "web" as const;
    const thread =
      (await getAgentThread(service, channel, externalChatId)) ??
      (await upsertAgentThread(service, {
        diverId: user.id,
        channel,
        externalChatId,
        metadata: { role },
      }));

    const agentResult = await runHermesDiverTurn({
      supabase,
      diverId: user.id,
      username: userRow?.username ?? null,
      displayName: userRow?.full_name ?? "Diver",
      message,
      history: body.history,
    });

    await logAgentInteraction({
      actorId: user.id,
      feature: "web_chat_diver_message",
      input: { message, threadId: thread.id, historyLength: body.history?.length ?? 0 },
      output: { reply: agentResult.reply, suggestionsCount: agentResult.suggestions.length },
    });

    return NextResponse.json({
      ok: true,
      role,
      reply: agentResult.reply,
      suggestions: agentResult.suggestions,
      profileStatus: agentResult.profile.profile.profile_status,
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
