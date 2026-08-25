import { Resend } from "resend";
import { isEmailConfigured } from "@/lib/feature-flags";
import { CONTACT_EMAIL } from "@/lib/site";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendUserEmailInput = {
  /** Logged-in user's email — used for From when the domain is verified. */
  userEmail: string;
  /** Logged-in user's display name. */
  userDisplayName: string;
  /** Public username — Reply-To becomes `{username}@{inbound domain}` so Hermes can receive replies. */
  username?: string | null;
  userId?: string | null;
  /** Override Reply-To (apply desk uses hello@doneunder.ai). */
  replyTo?: string | null;
  to: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
};

export type SendUserEmailResult =
  | { ok: true; id: string; from: string; replyTo: string; attached: string[] }
  | { ok: false; error: string };

export function stripQuotes(value: string) {
  return value.replace(/^["']|["']$/g, "").trim();
}

export function parseEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

/**
 * Mailbox domain Hermes listens on.
 *
 * The Resend plan allows one custom domain. That slot is `doneunder.ai` for
 * sending. Apex MX stays on One.com. `inbound.doneunder.ai` already has the
 * Resend receiving MX, but cannot be added as a second domain until the plan
 * allows it.
 *
 * Until then, set `RESEND_INBOUND_DOMAIN` to the managed host from Emails →
 * Receiving → Receiving address (`*.resend.app`). Reply-To becomes
 * `{username}@{that host}`. When the extra domain is allowed, add
 * `inbound.doneunder.ai` in eu-west-1 with receiving on and point the env
 * back at it. Do not enable receiving on the apex and do not put Resend MX on @.
 */
export function inboundReceivingDomain() {
  const configured = stripQuotes(process.env.RESEND_INBOUND_DOMAIN || "inbound.doneunder.ai").toLowerCase();
  return configured.replace(/^@/, "") || "inbound.doneunder.ai";
}

export function isManagedResendReceivingDomain(domain: string) {
  return domain.toLowerCase().endsWith(".resend.app");
}

export function isInboundReceivingAddress(address: string) {
  const domain = emailDomain(parseEmailAddress(address));
  return domain === inboundReceivingDomain() || isManagedResendReceivingDomain(domain);
}

export function inboundReplyToAddress(username?: string | null, userId?: string | null) {
  const raw = (username?.trim() || userId?.replace(/-/g, "").slice(0, 12) || "hermes").toLowerCase();
  const local = raw.replace(/[^a-z0-9._+-]/g, "") || "hermes";
  return `${local}@${inboundReceivingDomain()}`;
}

/**
 * Address contractors should reply to. Never expose *.resend.app — that is an
 * internal receiving host. Until inbound.doneunder.ai can receive, desk mail
 * is hello@doneunder.ai.
 */
export function contractorReplyToAddress(username?: string | null, userId?: string | null) {
  const domain = inboundReceivingDomain();
  if (isManagedResendReceivingDomain(domain)) return CONTACT_EMAIL;
  return inboundReplyToAddress(username, userId);
}

/** Visible reply mailbox so Gmail Reply-To misses still reach Hermes. */
export function withInboundReplyFooter(body: string, replyTo: string) {
  const text = body.trim();
  const address = replyTo.trim();
  const needle = address.toLowerCase();
  if (!needle.includes("@") || text.toLowerCase().includes(needle)) return text;
  if (isManagedResendReceivingDomain(emailDomain(address))) {
    return `${text}\n\n—\nReply to this email and I will see it in my workspace.`;
  }
  return `${text}\n\n—\nReply to this email, or write to ${address}, and I will see it in my workspace.`;
}

/**
 * Resolve the From header so mail appears to come from the logged-in person.
 *
 * - If the user's email domain matches RESEND_FROM_DOMAIN (or the domain of
 *   RESEND_FROM_EMAIL), send as `"Name" <user@domain>`.
 * - Otherwise send as `"Name via doneunder.ai" <RESEND_FROM_EMAIL>`.
 * - Reply-To is `{username}@inbound.doneunder.ai` when that domain can receive,
 *   otherwise hello@doneunder.ai. Never *.resend.app.
 */
export function resolveSenderIdentity(
  userEmail: string,
  userDisplayName: string,
  username?: string | null,
  userId?: string | null,
) {
  const accountEmail = stripQuotes(userEmail).toLowerCase();
  const displayName = userDisplayName.trim() || accountEmail.split("@")[0] || "doneunder user";
  const platformFrom = stripQuotes(process.env.RESEND_FROM_EMAIL || "Hermes <onboarding@resend.dev>");
  const platformAddress = parseEmailAddress(platformFrom);
  const allowedDomain =
    stripQuotes(process.env.RESEND_FROM_DOMAIN || "").toLowerCase() || emailDomain(platformAddress);

  const userDomain = emailDomain(accountEmail);
  const canSendAsUser = Boolean(allowedDomain && userDomain === allowedDomain);
  const replyTo = contractorReplyToAddress(username, userId);

  if (canSendAsUser) {
    return {
      from: `${displayName} <${accountEmail}>`,
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

  const identity = resolveSenderIdentity(
    input.userEmail,
    input.userDisplayName,
    input.username,
    input.userId,
  );
  const replyTo = stripQuotes(input.replyTo || "").includes("@")
    ? stripQuotes(input.replyTo || "").toLowerCase()
    : identity.replyTo;
  const resend = new Resend(stripQuotes(process.env.RESEND_API_KEY!));
  const attached = (input.attachments ?? [])
    .filter((item) => item.filename && item.content.length > 0)
    .map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
    }));

  const text = withInboundReplyFooter(body, replyTo);
  const { data, error } = await resend.emails.send({
    from: identity.from,
    to: [to],
    replyTo,
    subject,
    text,
    attachments: attached.length > 0 ? attached : undefined,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    id: data?.id ?? "sent",
    from: identity.from,
    replyTo,
    attached: attached.map((item) => item.filename),
  };
}
