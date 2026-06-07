import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export async function assertDiverUser(supabase: SupabaseClient, diverId: string) {
  const parsedId = uuidSchema.safeParse(diverId);
  if (!parsedId.success) {
    return { ok: false as const, status: 400, message: "Invalid diver id." };
  }

  const { data, error } = await supabase.from("users").select("id, role, username, email").eq("id", diverId).maybeSingle();
  if (error) {
    return { ok: false as const, status: 500, message: "Unable to verify diver account." };
  }
  if (!data || data.role !== "diver") {
    return { ok: false as const, status: 404, message: "Diver account not found." };
  }

  return { ok: true as const, user: data };
}
