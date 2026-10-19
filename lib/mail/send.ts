import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailAsLoggedInUser, resolveSenderIdentity } from "@/lib/email";
import { isEmailConfigured } from "@/lib/feature-flags";
import { ensureFreshGmailToken, listGmailInbox, sendViaGmail } from "@/lib/mail/gmail";
import { getPreferredMailbox, listConnectedMailboxes } from "@/lib/mail/mailbox-store";
import {
  ensureFreshOutlookToken,
  listOutlookInbox,
  sendViaOutlook,
} from "@/lib/mail/outlook";
import type { InboxMessage, SendMailInput, SendMailResult } from "@/lib/mail/types";

function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/**
 * Send as the logged-in user:
 * 1) Connected Gmail/Outlook mailbox (true From = their login inbox)
 * 2) Resend when the account email is on the verified doneunder domain
 * 3) Otherwise ask them to connect a mailbox
 */
export async function sendMailForUser(
  supabase: SupabaseClient,
  input: SendMailInput,
): Promise<SendMailResult> {
  const mailbox = await getPreferredMailbox(supabase, input.userId);

  if (mailbox?.provider === "gmail") {
    const fresh = await ensureFreshGmailToken(supabase, mailbox);
    return sendViaGmail(fresh, {
      to: input.to,
      subject: input.subject,
      body: input.body,
      fromName: input.userDisplayName,
    });
  }

  if (mailbox?.provider === "outlook") {
    const fresh = await ensureFreshOutlookToken(supabase, mailbox);
    return sendViaOutlook(fresh, {
      to: input.to,
      subject: input.subject,
      body: input.body,
    });
  }

  const identity = resolveSenderIdentity(input.userEmail, input.userDisplayName);
  if (identity.mode === "user" && isEmailConfigured()) {
    const result = await sendEmailAsLoggedInUser({
      userEmail: input.userEmail,
      userDisplayName: input.userDisplayName,
      to: input.to,
      subject: input.subject,
      body: input.body,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      id: result.id,
      from: result.from,
      replyTo: result.replyTo,
      provider: "resend",
    };
  }

  if (isEmailConfigured() && emailDomain(input.userEmail) === "doneunder.ai") {
    const result = await sendEmailAsLoggedInUser({
      userEmail: input.userEmail,
      userDisplayName: input.userDisplayName,
      to: input.to,
      subject: input.subject,
      body: input.body,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      id: result.id,
      from: result.from,
      replyTo: result.replyTo,
      provider: "resend",
    };
  }

  return {
    ok: false,
    error:
      "No connected mailbox. Connect Gmail or Outlook in the workspace to send as your login email. Accounts on @doneunder.ai can also send via Resend without connecting.",
  };
}

export async function listInboxForUser(
  supabase: SupabaseClient,
  userId: string,
  limit = 8,
): Promise<{ ok: true; messages: InboxMessage[]; mailboxEmail: string; provider: string } | { ok: false; error: string }> {
  const boxes = await listConnectedMailboxes(supabase, userId);
  const mailbox = boxes[0];
  if (!mailbox) {
    return {
      ok: false,
      error: "No connected mailbox. Connect Gmail or Outlook to let Hermes read your inbox.",
    };
  }

  try {
    if (mailbox.provider === "gmail") {
      const fresh = await ensureFreshGmailToken(supabase, mailbox);
      const messages = await listGmailInbox(fresh, limit);
      return { ok: true, messages, mailboxEmail: fresh.email, provider: "gmail" };
    }
    const fresh = await ensureFreshOutlookToken(supabase, mailbox);
    const messages = await listOutlookInbox(fresh, limit);
    return { ok: true, messages, mailboxEmail: fresh.email, provider: "outlook" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Inbox sync failed.",
    };
  }
}
