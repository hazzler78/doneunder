import { Resend } from "resend";
import { isEmailConfigured } from "@/lib/feature-flags";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendUserEmailInput = {
  /** Logged-in user's email — always used as Reply-To. */
  userEmail: string;
  /** Logged-in user's display name. */
  userDisplayName: string;
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
};

export type SendUserEmailResult =
  | { ok: true; id: string; from: string; replyTo: string; attached: string[] }
  | { ok: false; error: string };

function stripQuotes(value: string) {
  return value.replace(/^["']|["']$/g, "").trim();
}

function parseEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/**
 * Resolve the From header so mail appears to come from the logged-in person.
 *
 * - If the user's email domain matches RESEND_FROM_DOMAIN (or the domain of
 *   RESEND_FROM_EMAIL), send as `"Name" <user@domain>`.
 * - Otherwise send as `"Name via doneunder.ai" <RESEND_FROM_EMAIL>` with
 *   Reply-To set to the user's real address (providers block forging Gmail etc.).
 */
export function resolveSenderIdentity(userEmail: string, userDisplayName: string) {
  const replyTo = stripQuotes(userEmail).toLowerCase();
  const displayName = userDisplayName.trim() || replyTo.split("@")[0] || "doneunder user";
  const platformFrom = stripQuotes(process.env.RESEND_FROM_EMAIL || "Hermes <onboarding@resend.dev>");
  const platformAddress = parseEmailAddress(platformFrom);
  const allowedDomain =
    stripQuotes(process.env.RESEND_FROM_DOMAIN || "").toLowerCase() || emailDomain(platformAddress);

  const userDomain = emailDomain(replyTo);
  const canSendAsUser = Boolean(allowedDomain && userDomain === allowedDomain);

  if (canSendAsUser) {
    return {
      from: `${displayName} <${replyTo}>`,
      replyTo,
      mode: "user" as const,
    };
  }

  return {
    from: `${displayName} via doneunder.ai <${platformAddress}>`,
    replyTo,
    mode: "relay" as const,
  };
}

export async function sendEmailAsLoggedInUser(
  input: SendUserEmailInput,
): Promise<SendUserEmailResult> {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      error:
        "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL (verified domain) in the environment.",
    };
  }

  const to = stripQuotes(input.to).toLowerCase();
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (!to.includes("@") || !subject || !body) {
    return { ok: false, error: "to, subject, and body are required." };
  }

  const identity = resolveSenderIdentity(input.userEmail, input.userDisplayName);
  const resend = new Resend(stripQuotes(process.env.RESEND_API_KEY!));
  const attached = (input.attachments ?? [])
    .filter((item) => item.filename && item.content.length > 0)
    .map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
    }));

  const { data, error } = await resend.emails.send({
    from: identity.from,
    to: [to],
    replyTo: identity.replyTo,
    subject,
    text: body,
    attachments: attached.length > 0 ? attached : undefined,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    id: data?.id ?? "sent",
    from: identity.from,
    replyTo: identity.replyTo,
    attached: attached.map((item) => item.filename),
  };
}
