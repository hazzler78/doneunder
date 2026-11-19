import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentMessage } from "@/lib/agent-messages";
import { getAgentThread, upsertWorkspaceThread } from "@/lib/agent-threads";

export const DEFERRED_CERT_ZERO_READ_SOURCE = "deferred_cert_zero_read";

export function buildDeferredCertZeroReadMessage(fileName: string) {
  return (
    `I saved **${fileName}**, but I could not read any ticket from it — nothing was added to your certifications.\n\n` +
    `Please either:\n` +
    `• Type the **certificate name**, **issuer**, **issue date**, and **expiry date** (if it expires), or\n` +
    `• Upload a **clearer scan** (straight-on photo or a text-based PDF).\n\n` +
    `I will not count this file toward job matching until a ticket is on your profile. ` +
    `When the details are saved, say which campaign to match.`
  );
}

async function zeroReadAlreadyPosted(
  supabase: SupabaseClient,
  threadId: string,
  fileName: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_messages")
    .select("metadata, role")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw new Error(error.message);
  return (data ?? []).some((row) => {
    const meta = row.metadata as Record<string, unknown> | null | undefined;
    return (
      meta?.source === DEFERRED_CERT_ZERO_READ_SOURCE &&
      typeof meta.fileName === "string" &&
      meta.fileName === fileName
    );
  });
}

/** Follow up in Hermes when a deferred pack read finishes with zero tickets. */
export async function notifyDeferredCertZeroRead(
  supabase: SupabaseClient,
  diverId: string,
  fileName: string,
): Promise<{ notified: boolean }> {
  const thread =
    (await getAgentThread(supabase, "web", diverId)) ??
    (await upsertWorkspaceThread(supabase, {
      userId: diverId,
      role: "diver",
      channel: "web",
      externalChatId: diverId,
    }));

  if (await zeroReadAlreadyPosted(supabase, thread.id, fileName)) {
    return { notified: false };
  }

  await appendAgentMessage(supabase, {
    threadId: thread.id,
    role: "assistant",
    content: buildDeferredCertZeroReadMessage(fileName),
    metadata: { source: DEFERRED_CERT_ZERO_READ_SOURCE, fileName },
  });

  return { notified: true };
}