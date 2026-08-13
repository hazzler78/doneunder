import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentMessageRole = "user" | "assistant" | "system";

export type AgentMessage = {
  id: string;
  thread_id: string;
  role: AgentMessageRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const MESSAGE_COLUMNS = "id,thread_id,role,content,metadata,created_at" as const;
const MAX_MESSAGE_CHARS = 8000;

function clipMessageContent(content: string) {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_MESSAGE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_MESSAGE_CHARS - 1)}…`;
}

export async function listAgentMessages(
  supabase: SupabaseClient,
  threadId: string,
  options?: { limit?: number },
): Promise<AgentMessage[]> {
  const limit = options?.limit ?? 40;
  const { data, error } = await supabase
    .from("agent_messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return ((data ?? []) as AgentMessage[]).reverse();
}

export async function appendAgentMessage(
  supabase: SupabaseClient,
  input: {
    threadId: string;
    role: AgentMessageRole;
    content: string;
    metadata?: Record<string, unknown>;
  },
): Promise<AgentMessage> {
  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      thread_id: input.threadId,
      role: input.role,
      content: clipMessageContent(input.content),
      metadata: input.metadata ?? {},
    })
    .select(MESSAGE_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to persist agent message.");
  return data as AgentMessage;
}

export async function appendAgentTurn(
  supabase: SupabaseClient,
  input: {
    threadId: string;
    userContent: string;
    assistantContent: string;
    metadata?: Record<string, unknown>;
  },
) {
  await appendAgentMessage(supabase, {
    threadId: input.threadId,
    role: "user",
    content: input.userContent,
    metadata: input.metadata,
  });
  await appendAgentMessage(supabase, {
    threadId: input.threadId,
    role: "assistant",
    content: input.assistantContent,
    metadata: input.metadata,
  });
}

export function agentMessagesToChatHistory(messages: AgentMessage[]) {
  return messages
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({
      role: item.role === "user" ? ("user" as const) : ("assistant" as const),
      content: item.content,
    }));
}
