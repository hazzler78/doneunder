export type MailProvider = "gmail" | "outlook" | "resend";

export type ConnectedMailbox = {
  id: string;
  user_id: string;
  provider: "gmail" | "outlook";
  email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
};

export type MailboxStatus = {
  provider: "gmail" | "outlook";
  email: string;
  connected: boolean;
  tokenExpiresAt: string | null;
};

export type SendMailInput = {
  userId: string;
  userEmail: string;
  userDisplayName: string;
  to: string;
  subject: string;
  body: string;
};

export type SendMailResult =
  | {
      ok: true;
      id: string;
      from: string;
      replyTo?: string;
      provider: MailProvider;
    }
  | { ok: false; error: string };

export type InboxMessage = {
  id: string;
  provider: "gmail" | "outlook";
  from: string;
  to: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  threadId?: string;
};
