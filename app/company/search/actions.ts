"use server";

import {
  criteriaFromForm,
  friendlyRpcError,
  parseSearchRows,
  revealCardSchema,
  type RevealCard,
  type SearchResult,
} from "@/lib/company-search";
import { previewMatchesFromMock } from "@/lib/company-preview";
import { hermesCompanyPreviewSearch } from "@/lib/hermes-company-search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SearchState =
  | {
      ok: true;
      result: SearchResult;
      profiles?: RevealCard[];
      hermesSummary?: string;
      hermesSource?: "ai" | "heuristic";
    }
  | { ok: false; error: string }
  | null;
export type RevealState = { ok: true; card: RevealCard } | { ok: false; error: string };
export type HermesSearchState =
  | {
      ok: true;
      summary: string;
      result: SearchResult;
      profiles: RevealCard[];
      source: "ai" | "heuristic";
    }
  | { ok: false; error: string };
export type CompanyAccessState = {
  role: "company" | "other";
  subscriptionActive: boolean;
  email: string | null;
  companyName: string | null;
};

async function requireCompany(): Promise<
  | { ok: true; userId: string; email: string | null; subscriptionActive: boolean; companyName: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: friendlyRpcError("not_authenticated") };

  const { data: actor } = await supabase.from("users").select("role, email").eq("id", user.id).maybeSingle();
  if (actor?.role !== "company") return { ok: false, error: friendlyRpcError("company_account_required") };

  const { data: company } = await supabase
    .from("companies")
    .select("company_name, subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const subscriptionActive =
    (company?.subscription_status ?? "").trim().toLowerCase() === "active";

  return {
    ok: true,
    userId: user.id,
    email: actor.email ?? user.email ?? null,
    subscriptionActive,
    companyName: company?.company_name ?? null,
  };
}

export async function loadCompanyAccess(): Promise<CompanyAccessState> {
  const access = await requireCompany();
  if (!access.ok) return { role: "other", subscriptionActive: false, email: null, companyName: null };
  return {
    role: "company",
    subscriptionActive: access.subscriptionActive,
    email: access.email,
    companyName: access.companyName,
  };
}

/**
 * Runs a company search. Active subscribers try the RPC (full unlock path).
 * Everyone else (or RPC failure) gets a locked preview with match count —
 * initials + industry only until payment unlocks this search.
 */
export async function runSearch(_prev: SearchState, form: FormData): Promise<SearchState> {
  const parsed = criteriaFromForm(form);
  if (!parsed.success) return { ok: false, error: "Check the search fields and try again." };

  const access = await requireCompany();
  if (!access.ok) return { ok: false, error: access.error };

  if (access.subscriptionActive) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_divers", { p_criteria: parsed.data });
    if (!error) {
      return {
        ok: true,
        result: parseSearchRows(data, { unlocked: true, source: "rpc" }),
      };
    }
    // Fall through to preview if RPC rejects (e.g. migration lag) so the UI stays demoable.
    if (!String(error.message).includes("company_subscription_required")) {
      // still try preview below for empty environments
    }
  }

  const preview = previewMatchesFromMock(parsed.data);
  return {
    ok: true,
    result: {
      searchId: preview.searchId,
      matchCount: preview.matchCount,
      teasers: preview.teasers,
      unlocked: false,
      source: "preview",
    },
    profiles: preview.unlockedProfiles,
  };
}

/** Natural-language / voice brief → locked preview matches (same unlock rules). */
export async function runHermesCompanySearch(brief: string): Promise<HermesSearchState> {
  const access = await requireCompany();
  if (!access.ok) return { ok: false, error: access.error };
  const trimmed = brief.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Tell Hermes a bit more — tickets, location, or hours help." };
  }

  try {
    const outcome = await hermesCompanyPreviewSearch(trimmed);
    return {
      ok: true,
      summary: outcome.summary,
      result: outcome.result,
      profiles: outcome.profiles,
      source: outcome.source,
    };
  } catch (error) {
    console.error("Hermes company search failed:", error);
    return { ok: false, error: "Hermes could not run that search. Try again or use the filters below." };
  }
}

/** One reveal per search token when using the live RPC. */
export async function revealMatch(searchId: string, slot: number): Promise<RevealState> {
  if (typeof searchId !== "string" || !/^[0-9a-f-]{36}$/i.test(searchId) || !Number.isInteger(slot)) {
    return { ok: false, error: friendlyRpcError("invalid_slot") };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reveal_match", { p_search_id: searchId, p_slot: slot });
  if (error) return { ok: false, error: friendlyRpcError(error.message) };
  const card = revealCardSchema.safeParse(data);
  if (!card.success) return { ok: false, error: "Diver profile is no longer available. Run a new search." };
  return { ok: true, card: card.data };
}
