import { createClient } from "@supabase/supabase-js";

export async function logAiInteraction(payload: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false } });
  await supabase.from("ai_interactions").insert(payload);
}
