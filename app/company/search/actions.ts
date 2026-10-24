"use server";

import {
  criteriaFromForm,
  friendlyRpcError,
  parseSearchRows,
  revealCardSchema,
  type RevealCard,
  type SearchResult,
} from "@/lib/company-search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SearchState = { ok: true; result: SearchResult } | { ok: false; error: string } | null;
export type RevealState = { ok: true; card: RevealCard } | { ok: false; error: string };

/** Runs search_divers with the company's own session (never the service role). */
export async function runSearch(_prev: SearchState, form: FormData): Promise<SearchState> {
  const parsed = criteriaFromForm(form);
  if (!parsed.success) return { ok: false, error: "Check the search fields and try again." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_divers", { p_criteria: parsed.data });
  if (error) return { ok: false, error: friendlyRpcError(error.message) };
  return { ok: true, result: parseSearchRows(data) };
}

/** One reveal per search token; the RPC enforces ownership, expiry and uniqueness. */
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
