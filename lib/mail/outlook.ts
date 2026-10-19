import type { SupabaseClient } from "@supabase/supabase-js";
import { getMicrosoftOAuthConfig } from "@/lib/mail/config";
import { updateMailboxTokens } from "@/lib/mail/mailbox-store";
import type { ConnectedMailbox, InboxMessage, SendMailResult } from "@/lib/mail/types";

export function buildMicrosoftAuthUrl(state: string) {
  const config = getMicrosoftOAuthConfig();
  const url = new URL(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeMicrosoftCode(code: string) {
  const config = getMicrosoftOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    scope: config.scopes.join(" "),
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Microsoft token exchange failed.");
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

export async function fetchMicrosoftProfileEmail(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as {
    mail?: string;
    userPrincipalName?: string;
    error?: { message?: string };
  };
  const email = (data.mail || data.userPrincipalName || "").toLowerCase();
  if (!response.ok || !email) {
    throw new Error(data.error?.message || "Could not read Microsoft account email.");
  }
  return email;
}

async function refreshMicrosoftAccessToken(refreshToken: string) {
  const config = getMicrosoftOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: config.scopes.join(" "),
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Microsoft token refresh failed.");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  };
}

export async function ensureFreshOutlookToken(
  supabase: SupabaseClient,
  mailbox: ConnectedMailbox,
): Promise<ConnectedMailbox> {
  const expiresAt = mailbox.token_expires_at ? Date.parse(mailbox.token_expires_at) : 0;
  const stillValid = expiresAt && expiresAt > Date.now() + 60_000;
  if (stillValid) return mailbox;
  if (!mailbox.refresh_token) return mailbox;

  const refreshed = await refreshMicrosoftAccessToken(mailbox.refresh_token);
  await updateMailboxTokens(supabase, mailbox.id, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt: refreshed.expiresAt,
  });
  return {
    ...mailbox,
    access_token: refreshed.accessToken,
    refresh_token: refreshed.refreshToken ?? mailbox.refresh_token,
    token_expires_at: refreshed.expiresAt,
  };
}

export async function sendViaOutlook(
  mailbox: ConnectedMailbox,
  input: { to: string; subject: string; body: string },
): Promise<SendMailResult> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mailbox.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.body },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    return { ok: false, error: data.error?.message || "Outlook send failed." };
  }

  return {
    ok: true,
    id: `outlook-${Date.now()}`,
    from: mailbox.email,
    provider: "outlook",
  };
}

export async function listOutlookInbox(
  mailbox: ConnectedMailbox,
  limit = 8,
): Promise<InboxMessage[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  url.searchParams.set("$top", String(limit));
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set(
    "$select",
    "id,subject,bodyPreview,from,toRecipients,receivedDateTime,conversationId",
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${mailbox.access_token}` },
  });
  const data = (await response.json()) as {
    value?: Array<{
      id: string;
      subject?: string;
      bodyPreview?: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      receivedDateTime?: string;
      conversationId?: string;
    }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || "Could not list Outlook inbox.");
  }

  return (data.value ?? []).map((item) => {
    const fromName = item.from?.emailAddress?.name;
    const fromAddr = item.from?.emailAddress?.address ?? "";
    return {
      id: item.id,
      provider: "outlook" as const,
      from: fromName ? `${fromName} <${fromAddr}>` : fromAddr,
      to: (item.toRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean).join(", "),
      subject: item.subject || "(no subject)",
      snippet: item.bodyPreview ?? "",
      receivedAt: item.receivedDateTime ?? new Date().toISOString(),
      threadId: item.conversationId,
    };
  });
}
