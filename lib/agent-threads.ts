import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDiverProfileRow } from "@/lib/diver-bootstrap";

export type AgentChannel = "telegram" | "web";

export type AgentThread = {
  id: string;
  user_id: string;
  diver_id: string | null;
  channel: AgentChannel;
  external_chat_id: string;
  last_message_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function upsertWorkspaceThread(
  supabase: SupabaseClient,
  input: {
    userId: string;
    role: "diver" | "company";
    channel: AgentChannel;
    externalChatId: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (input.role === "diver") {
    await ensureDiverProfileRow(supabase, input.userId);
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("agent_threads")
    .upsert(
      {
        user_id: input.userId,
        diver_id: input.role === "diver" ? input.userId : null,
        channel: input.channel,
        external_chat_id: input.externalChatId,
        last_message_at: nowIso,
        metadata: { role: input.role, ...(input.metadata ?? {}) },
      },
      { onConflict: "channel,external_chat_id" },
    )
    .select("id,user_id,diver_id,channel,external_chat_id,last_message_at,metadata,created_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AgentThread;
}

export async function upsertAgentThread(
  supabase: SupabaseClient,
  input: {
    diverId: string;
    channel: AgentChannel;
    externalChatId: string;
    metadata?: Record<string, unknown>;
  },
) {
  return upsertWorkspaceThread(supabase, {
    userId: input.diverId,
    role: "diver",
    channel: input.channel,
    externalChatId: input.externalChatId,
    metadata: input.metadata,
  });
}

export async function resolveDiverIdFromThread(
  supabase: SupabaseClient,
  channel: AgentChannel,
  externalChatId: string,
) {
  const { data, error } = await supabase
    .from("agent_threads")
    .select("diver_id")
    .eq("channel", channel)
    .eq("external_chat_id", externalChatId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.diver_id ?? null;
}

export async function touchAgentThread(
  supabase: SupabaseClient,
  channel: AgentChannel,
  externalChatId: string,
) {
  await supabase
    .from("agent_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("channel", channel)
    .eq("external_chat_id", externalChatId);
}

export async function getAgentThread(
  supabase: SupabaseClient,
  channel: AgentChannel,
  externalChatId: string,
) {
  const { data, error } = await supabase
    .from("agent_threads")
    .select("id,user_id,diver_id,channel,external_chat_id,last_message_at,metadata,created_at")
    .eq("channel", channel)
    .eq("external_chat_id", externalChatId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AgentThread | null) ?? null;
}

export async function ensureWorkspaceWebThread(
  supabase: SupabaseClient,
  userId: string,
  role: "diver" | "company",
) {
  const existing = await getAgentThread(supabase, "web", userId);
  if (existing) {
    if (role === "diver" && !existing.diver_id) {
      return upsertWorkspaceThread(supabase, {
        userId,
        role,
        channel: "web",
        externalChatId: userId,
        metadata: { role },
      });
    }
    return existing;
  }

  return upsertWorkspaceThread(supabase, {
    userId,
    role,
    channel: "web",
    externalChatId: userId,
    metadata: { role },
  });
}

export async function mergeAgentThreadMetadata(
  supabase: SupabaseClient,
  threadId: string,
  patch: Record<string, unknown>,
) {
  const { data: current, error: readError } = await supabase
    .from("agent_threads")
    .select("metadata")
    .eq("id", threadId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const metadata = {
    ...((current?.metadata as Record<string, unknown> | null) ?? {}),
    ...patch,
  };

  const { error } = await supabase
    .from("agent_threads")
    .update({
      metadata,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", threadId);
  if (error) throw new Error(error.message);
  return metadata;
}
