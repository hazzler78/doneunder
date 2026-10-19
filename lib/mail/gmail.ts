import type { SupabaseClient } from "@supabase/supabase-js";
import { getGoogleOAuthConfig } from "@/lib/mail/config";
import { updateMailboxTokens } from "@/lib/mail/mailbox-store";
import type { ConnectedMailbox, InboxMessage, SendMailResult } from "@/lib/mail/types";

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildGoogleAuthUrl(state: string) {
  const config = getGoogleOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string) {
  const config = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token exchange failed.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
    scopes: (data.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function fetchGoogleProfileEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as { email?: string; error?: { message?: string } };
  if (!response.ok || !data.email) {
    throw new Error(data.error?.message || "Could not read Google account email.");
  }
  return data.email.toLowerCase();
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const config = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token refresh failed.");
  }
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  };
}

export async function ensureFreshGmailToken(
  supabase: SupabaseClient,
  mailbox: ConnectedMailbox,
): Promise<ConnectedMailbox> {
  const expiresAt = mailbox.token_expires_at ? Date.parse(mailbox.token_expires_at) : 0;
  const stillValid = expiresAt && expiresAt > Date.now() + 60_000;
  if (stillValid) return mailbox;
  if (!mailbox.refresh_token) return mailbox;

  const refreshed = await refreshGoogleAccessToken(mailbox.refresh_token);
  await updateMailboxTokens(supabase, mailbox.id, {
    accessToken: refreshed.accessToken,
    tokenExpiresAt: refreshed.expiresAt,
  });
  return {
    ...mailbox,
    access_token: refreshed.accessToken,
    token_expires_at: refreshed.expiresAt,
  };
}

export async function sendViaGmail(
  mailbox: ConnectedMailbox,
  input: { to: string; subject: string; body: string; fromName: string },
): Promise<SendMailResult> {
  const fromHeader = `${input.fromName} <${mailbox.email}>`;
  const raw = [
    `From: ${fromHeader}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.body,
  ].join("\r\n");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mailbox.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: toBase64Url(raw) }),
  });
  const data = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !data.id) {
    return { ok: false, error: data.error?.message || "Gmail send failed." };
  }
  return { ok: true, id: data.id, from: fromHeader, provider: "gmail" };
}

export async function listGmailInbox(
  mailbox: ConnectedMailbox,
  limit = 8,
): Promise<InboxMessage[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent("in:inbox")}`,
    { headers: { Authorization: `Bearer ${mailbox.access_token}` } },
  );
  const listData = (await listRes.json()) as {
    messages?: Array<{ id: string; threadId?: string }>;
    error?: { message?: string };
  };
  if (!listRes.ok) {
    throw new Error(listData.error?.message || "Could not list Gmail inbox.");
  }

  const messages: InboxMessage[] = [];
  for (const item of listData.messages ?? []) {
    const detailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${mailbox.access_token}` } },
    );
    const detail = (await detailRes.json()) as {
      id?: string;
      threadId?: string;
      snippet?: string;
      internalDate?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    if (!detailRes.ok || !detail.id) continue;
    const headers = detail.payload?.headers ?? [];
    const get = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
    messages.push({
      id: detail.id,
      provider: "gmail",
      from: get("From"),
      to: get("To"),
      subject: get("Subject") || "(no subject)",
      snippet: detail.snippet ?? "",
      receivedAt: detail.internalDate
        ? new Date(Number(detail.internalDate)).toISOString()
        : new Date().toISOString(),
      threadId: detail.threadId,
    });
  }
  return messages;
}
