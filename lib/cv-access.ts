import { validateCvShareToken } from "@/lib/cv-share-links";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FullCvAccess =
  | { allowed: true; reason: "owner" | "admin" | "active_company" | "diver_shared" }
  | { allowed: false; reason: "anonymous" | "diver_other" | "company_inactive" | "company_not_revealed" | "unknown" };

export type ResolveFullCvAccessOptions = {
  shareToken?: string | null;
};

/**
 * Who may see the full living CV (experiences, cert numbers, references).
 * Public ambassador cards stay free; full pack is owner / admin / paying company
 * (Unlimited subscription, or a one-time search valid 30 days from payment)
 * that has revealed this diver through Search & Match (reveal_match RPC).
 * Employers may also open a time-limited share link from a Hermes application email.
 * Companies never see reference contact details (see `showsReferences`).
 */
export async function resolveFullCvAccess(
  diverUserId: string,
  options?: ResolveFullCvAccessOptions,
): Promise<FullCvAccess> {
  const shareToken = options?.shareToken?.trim();
  if (shareToken) {
    const valid = await validateCvShareToken(shareToken, diverUserId);
    if (valid) return { allowed: true, reason: "diver_shared" };
  }

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
    // Access = revealed this diver AND (active subscription OR the reveal came from a one-time search
    // whose 30-day entitlement is still valid). Decided in SQL (migration 022) so it matches search_divers.
    const { data: hasAccess, error } = await supabase.rpc("company_has_cv_access", { p_diver: diverUserId });
    if (!error && hasAccess === true) return { allowed: true, reason: "active_company" };

    const { data: reveal } = await supabase
      .from("match_reveals")
      .select("id")
      .eq("company_id", actor.id)
      .eq("diver_id", diverUserId)
      .limit(1)
      .maybeSingle();
    if (!reveal) return { allowed: false, reason: "company_not_revealed" };
    return { allowed: false, reason: "company_inactive" };
  }

  if (actor.role === "diver") return { allowed: false, reason: "diver_other" };
  return { allowed: false, reason: "unknown" };
}

/** Reference names/phone/email are only for the diver themself and admins. */
export function showsReferences(access: FullCvAccess) {
  return access.allowed && (access.reason === "owner" || access.reason === "admin");
}

/** Share-link viewers and companies use service role or company RLS — not anonymous session. */
export function cvSectionsNeedServiceRole(access: FullCvAccess) {
  return access.allowed && access.reason === "diver_shared";
}
