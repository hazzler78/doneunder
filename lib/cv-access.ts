import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FullCvAccess =
  | { allowed: true; reason: "owner" | "admin" | "active_company" }
  | { allowed: false; reason: "anonymous" | "diver_other" | "company_inactive" | "unknown" };

/**
 * Who may see the full living CV (experiences, cert numbers, references).
 * Public ambassador cards stay free; full pack is owner / admin / paying company.
 */
export async function resolveFullCvAccess(diverUserId: string): Promise<FullCvAccess> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { allowed: false, reason: "anonymous" };

  if (auth.user.id === diverUserId) return { allowed: true, reason: "owner" };

  const { data: actor } = await supabase
    .from("users")
    .select("id,role")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!actor) return { allowed: false, reason: "unknown" };
  if (actor.role === "admin") return { allowed: true, reason: "admin" };

  if (actor.role === "company") {
    const { data: company } = await supabase
      .from("companies")
      .select("subscription_status")
      .eq("user_id", actor.id)
      .maybeSingle();
    const status = company?.subscription_status?.trim().toLowerCase() || "inactive";
    if (status === "active") return { allowed: true, reason: "active_company" };
    return { allowed: false, reason: "company_inactive" };
  }

  if (actor.role === "diver") return { allowed: false, reason: "diver_other" };
  return { allowed: false, reason: "unknown" };
}
