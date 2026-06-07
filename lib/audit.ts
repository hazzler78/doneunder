import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export async function logAiInteraction(payload: Record<string, unknown>) {
  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from("ai_interactions").insert(payload);
  } catch {
    // Audit logging must not break primary flows.
  }
}

export async function logAgentInteraction(input: {
  actorId?: string | null;
  feature: string;
  input: unknown;
  output: unknown;
}) {
  await logAiInteraction({
    actor_id: input.actorId ?? null,
    feature: input.feature,
    input: typeof input.input === "string" ? input.input : JSON.stringify(input.input),
    output: input.output,
  });
}
