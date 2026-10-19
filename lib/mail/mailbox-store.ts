import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectedMailbox } from "@/lib/mail/types";

export async function listConnectedMailboxes(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("connected_mailboxes")
    .select("id, user_id, provider, email, access_token, refresh_token, token_expires_at, scopes, metadata")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ConnectedMailbox[];
}

export async function getPreferredMailbox(supabase: SupabaseClient, userId: string) {
  const boxes = await listConnectedMailboxes(supabase, userId);
  return boxes[0] ?? null;
}

export async function upsertConnectedMailbox(
  supabase: SupabaseClient,
  input: {
    userId: string;
    provider: "gmail" | "outlook";
    email: string;
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
    scopes?: string[];
    metadata?: Record<string, unknown>;
  },
) {
  const { data: existing } = await supabase
    .from("connected_mailboxes")
    .select("refresh_token")
    .eq("user_id", input.userId)
    .eq("provider", input.provider)
    .maybeSingle();

  const refreshToken = input.refreshToken ?? existing?.refresh_token ?? null;

  const { data, error } = await supabase
    .from("connected_mailboxes")
    .upsert(
      {
        user_id: input.userId,
        provider: input.provider,
        email: input.email.toLowerCase(),
        access_token: input.accessToken,
        refresh_token: refreshToken,
        token_expires_at: input.tokenExpiresAt ?? null,
        scopes: input.scopes ?? [],
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )
    .select("id, user_id, provider, email, access_token, refresh_token, token_expires_at, scopes, metadata")
    .single();

  if (error) throw error;
  return data as ConnectedMailbox;
}

export async function updateMailboxTokens(
  supabase: SupabaseClient,
  mailboxId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
  },
) {
  const { error } = await supabase
    .from("connected_mailboxes")
    .update({
      access_token: tokens.accessToken,
      ...(tokens.refreshToken !== undefined ? { refresh_token: tokens.refreshToken } : {}),
      token_expires_at: tokens.tokenExpiresAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mailboxId);

  if (error) throw error;
}

export async function deleteConnectedMailbox(
  supabase: SupabaseClient,
  userId: string,
  provider: "gmail" | "outlook",
) {
  const { error } = await supabase
    .from("connected_mailboxes")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw error;
}
