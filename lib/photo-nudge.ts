import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentMessage } from "@/lib/agent-messages";
import { getAgentThread, upsertWorkspaceThread } from "@/lib/agent-threads";

export const PHOTO_NUDGE_ASSISTANT_TEXT =
  "Your page is live — but without a face photo it looks unfinished to contractors. " +
  "Next step: open /preview, tap Add photo, and upload a clear head-and-shoulders shot. " +
  "No photo = weak first impression. Do this before you share the link.";

export async function diverHasPhoto(
  supabase: SupabaseClient,
  diverId: string,
): Promise<boolean> {
  const { data } = await supabase.from("users").select("avatar_url").eq("id", diverId).maybeSingle();
  return Boolean(typeof data?.avatar_url === "string" && data.avatar_url.trim());
}

/** Persist a Hermes chat nudge right after publish when the diver still has no photo. */
export async function nudgeMissingPhotoAfterPublish(
  supabase: SupabaseClient,
  input: { diverId: string; role?: "diver" | "company" },
): Promise<{ hasPhoto: boolean; nudged: boolean }> {
  const hasPhoto = await diverHasPhoto(supabase, input.diverId);
  if (hasPhoto) return { hasPhoto: true, nudged: false };

  const thread =
    (await getAgentThread(supabase, "web", input.diverId)) ??
    (await upsertWorkspaceThread(supabase, {
      userId: input.diverId,
      role: input.role ?? "diver",
      channel: "web",
      externalChatId: input.diverId,
    }));

  await appendAgentMessage(supabase, {
    threadId: thread.id,
    role: "assistant",
    content: PHOTO_NUDGE_ASSISTANT_TEXT,
    metadata: { source: "photo-nudge-after-publish" },
  });

  return { hasPhoto: false, nudged: true };
}
