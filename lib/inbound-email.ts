import { inboundReceivingDomain, parseEmailAddress } from "@/lib/email";

export type InboundIntent = "certificates" | "general";
export type PendingInboundStatus = "pending" | "sent" | "declined";

export type PendingInbound = {
  from: string;
  subject: string;
  intent: InboundIntent;
  emailId: string;
  bodyExcerpt: string;
  status: PendingInboundStatus;
  receivedAt: string;
};

export type MatchedDiver = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  role: string | null;
};

const CERT_REQUEST_RE = /\b(cert(?:ificate)?s?|tickets?|imca|ndt|hse)\b/i;
const ASK_RE = /\b(may i|can i|could i|please|send|share|have|need|request|copies?|copy)\b/i;

export function htmlToPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function inboundBodyText(input: { text?: string | null; html?: string | null }) {
  const text = input.text?.trim() ?? "";
  if (text) return text;
  if (input.html?.trim()) return htmlToPlainText(input.html);
  return "";
}

export function excerptInboundBody(body: string, max = 900) {
  const cleaned = body.replace(/\r/g, "").trim();
  if (!cleaned) return "(no message body)";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function detectInboundIntent(subject: string, body: string): InboundIntent {
  const blob = `${subject}\n${body}`;
  if (CERT_REQUEST_RE.test(blob) && ASK_RE.test(blob)) return "certificates";
  if (CERT_REQUEST_RE.test(blob)) return "certificates";
  return "general";
}

export function collectRecipientAddresses(input: { to?: string[] | null; received_for?: string[] | null }) {
  const values = [...(input.to ?? []), ...(input.received_for ?? [])];
  const unique = new Set<string>();
  for (const value of values) {
    const address = parseEmailAddress(value);
    if (address.includes("@")) unique.add(address);
  }
  return [...unique];
}

export function recipientMatchesInboundMailbox(address: string, username: string | null) {
  if (!username) return false;
  const parsed = parseEmailAddress(address);
  const at = parsed.lastIndexOf("@");
  if (at < 0) return false;
  const local = parsed.slice(0, at);
  const domain = parsed.slice(at + 1);
  return local === username.toLowerCase() && domain === inboundReceivingDomain();
}

export function readPendingInbound(metadata: Record<string, unknown> | null | undefined): PendingInbound | null {
  const raw = metadata?.pending_inbound;
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.from !== "string" || !rec.from.includes("@")) return null;
  if (typeof rec.emailId !== "string" || !rec.emailId.trim()) return null;
  const intent = rec.intent === "certificates" ? "certificates" : "general";
  const status: PendingInboundStatus =
    rec.status === "sent" || rec.status === "declined" || rec.status === "pending" ? rec.status : "pending";
  return {
    from: parseEmailAddress(rec.from),
    subject: typeof rec.subject === "string" ? rec.subject : "(no subject)",
    intent,
    emailId: rec.emailId.trim(),
    bodyExcerpt: typeof rec.bodyExcerpt === "string" ? rec.bodyExcerpt : "",
    status,
    receivedAt: typeof rec.receivedAt === "string" ? rec.receivedAt : new Date().toISOString(),
  };
}

export function isInboundFollowUpConfirmation(message: string, pending: PendingInbound | null) {
  if (!pending || pending.status !== "pending") return false;
  const text = message.trim().toLowerCase();
  if (/^(yes|yeah|yep|y|ok|okay|sure|please do|go ahead|send( them| it)?|do it)[\s!.]*$/i.test(text)) {
    return true;
  }
  if (pending.intent === "certificates") {
    return (
      /\b(send|share|forward|attach).{0,24}\b(cert|ticket)/i.test(text) &&
      !/\b(don'?t|do not|not now)\b/i.test(text)
    );
  }
  return false;
}

export function isInboundFollowUpDecline(message: string, pending: PendingInbound | null) {
  if (!pending || pending.status !== "pending") return false;
  return /^(no|nope|not now|don't|do not|later|hold)([\s!.].*)?$/i.test(message.trim());
}

export function buildInboundNotice(pending: PendingInbound) {
  const asked =
    pending.intent === "certificates"
      ? "They are asking for your certificates. Reply yes and I will send them from your address."
      : "Reply here if you want me to draft or send a follow-up from your address.";

  return [
    `I received a reply from ${pending.from}.`,
    "",
    `Subject: ${pending.subject}`,
    "",
    "They wrote:",
    pending.bodyExcerpt,
    "",
    asked,
  ].join("\n");
}
