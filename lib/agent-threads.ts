import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentChannel = "telegram" | "web";

export type AgentThread = {
  id: string;
  diver_id: string;
  channel: AgentChannel;
  external_chat_id: string;
  last_message_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function upsertAgentThread(
  supabase: SupabaseClient,
  input: {
    diverId: string;
    channel: AgentChannel;
    externalChatId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("agent_threads")
    .upsert(
      {
        diver_id: input.diverId,
        channel: input.channel,
        external_chat_id: input.externalChatId,
        last_message_at: nowIso,
        metadata: input.metadata ?? {},
      },
      { onConflict: "channel,external_chat_id" },
    )
    .select("id,diver_id,channel,external_chat_id,last_message_at,metadata,created_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AgentThread;
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
