import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentTurn } from "@/lib/agent-messages";
import { getAgentThread, upsertWorkspaceThread } from "@/lib/agent-threads";

export async function logDiverUploadFailure(
  supabase: SupabaseClient,
  diverId: string,
  input: { fileName: string; fileSize: number; error: string; source: string },
) {
  const detail = `Upload failed for ${input.fileName} (${input.fileSize} bytes): ${input.error}`;
  console.error(`[diver-upload:${input.source}]`, detail);
  try {
    const thread =
      (await getAgentThread(supabase, "web", diverId)) ??
      (await upsertWorkspaceThread(supabase, {
        userId: diverId,
        role: "diver",
        channel: "web",
        externalChatId: diverId,
      }));
    await appendAgentTurn(supabase, {
      threadId: thread.id,
      userContent: `Tried to upload ${input.fileName}`,
      assistantContent: detail,
      metadata: {
        source: "upload-failure",
        uploadSource: input.source,
        fileName: input.fileName,
        fileSize: input.fileSize,
        error: input.error,
      },
    });
  } catch (logError) {
    console.error("Could not append upload failure to diver thread", logError);
  }
}
