import { CONTACT_EMAIL } from "@/lib/site";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export const HELLO_SAME_DAY_BLOCKED = "hello_same_day_send_blocked";
export const HELLO_GUARD_UNAVAILABLE = "hello_send_guard_unavailable";

const HELLO_ADDRESS = CONTACT_EMAIL.toLowerCase();

function stripQuotes(value: string) {
  return value.replace(/^["']|["']$/g, "").trim();
}

function parseEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

/** Normalize a recipient or From address for comparisons. */
export function normalizeEmail(value: string): string {
  return parseEmailAddress(stripQuotes(value || "")).toLowerCase();
}

/** True when the From header sends as the shared hello@ mailbox. */
export function isHelloPlatformFrom(fromHeader: string): boolean {
  const address = normalizeEmail(fromHeader);
  if (!address.includes("@")) return false;
  if (address === HELLO_ADDRESS) return true;
  const configured = stripQuotes(process.env.RESEND_FROM_EMAIL || "");
  if (configured) {
    const platform = normalizeEmail(configured);
    if (platform === address && platform === HELLO_ADDRESS) return true;
  }
  return false;
}

/** Calendar day in Europe/Berlin as YYYY-MM-DD. */
export function berlinCalendarDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Parse HELLO_EMAIL_SECOND_SEND_ALLOW.
 * Entries: `email` (means today Berlin) or `email:YYYY-MM-DD`.
 * Comma or whitespace separated.
 */
export function parseSecondSendAllowlist(
  raw: string | undefined,
  todayBerlin: string,
): Set<string> {
  const allowed = new Set<string>();
  const text = (raw || "").trim();
  if (!text) return allowed;

  for (const part of text.split(/[\s,]+/)) {
    const token = part.trim().toLowerCase();
    if (!token) continue;
    const colon = token.lastIndexOf(":");
    if (colon > 0 && /^\d{4}-\d{2}-\d{2}$/.test(token.slice(colon + 1))) {
      const email = normalizeEmail(token.slice(0, colon));
      const day = token.slice(colon + 1);
      if (email.includes("@") && day === todayBerlin) allowed.add(email);
      continue;
    }
    const email = normalizeEmail(token);
    if (email.includes("@")) allowed.add(email);
  }
  return allowed;
}

export function isHelloEmailGuardDisabled(): boolean {
  const flag = (process.env.HELLO_EMAIL_GUARD || "").trim().toLowerCase();
  return flag === "off" || flag === "0" || flag === "false";
}

export type HelloGuardDecision =
  | { ok: true; skipped: true; reason: "not_hello_from" | "guard_disabled" | "invalid_recipient" }
  | { ok: true; skipped: false; recipient: string; dayBerlin: string; priorCount: number; approved: boolean }
  | { ok: false; error: typeof HELLO_SAME_DAY_BLOCKED | typeof HELLO_GUARD_UNAVAILABLE; recipient: string; dayBerlin: string; priorCount?: number };

export type HelloOutboundMeta = {
  to: string;
  from: string;
  subject?: string;
  feature: string;
  now?: Date;
};

async function countPriorSends(recipient: string, dayBerlin: string): Promise<number> {
  const supabase = createServiceSupabaseClient();
  const { count, error } = await supabase
    .from("hello_outbound_sends")
    .select("id", { count: "exact", head: true })
    .eq("recipient_email", recipient)
    .eq("day_berlin", dayBerlin);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function hasDbApproval(recipient: string, dayBerlin: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("hello_outbound_approvals")
    .select("id")
    .eq("recipient_email", recipient)
    .eq("day_berlin", dayBerlin)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function logBlockedAttempt(input: {
  recipient: string;
  dayBerlin: string;
  subject?: string;
  feature: string;
  reason: string;
  priorCount: number;
}): Promise<void> {
  console.error("[hello-email-guard] blocked", {
    recipient: input.recipient,
    dayBerlin: input.dayBerlin,
    feature: input.feature,
    subject: input.subject ?? null,
    reason: input.reason,
    priorCount: input.priorCount,
  });
  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from("hello_outbound_blocks").insert({
      recipient_email: input.recipient,
      day_berlin: input.dayBerlin,
      subject: input.subject ?? null,
      feature: input.feature,
      reason: input.reason,
      prior_send_count: input.priorCount,
    });
  } catch (error) {
    console.error("[hello-email-guard] failed to persist block log", error);
  }
}

/**
 * Call before Resend when From is (or will be) hello@.
 * Blocks a second outbound to the same recipient on the Berlin calendar day
 * unless Mikael approved (env allowlist or hello_outbound_approvals row).
 */
export async function assertCanSendHelloEmail(input: HelloOutboundMeta): Promise<HelloGuardDecision> {
  if (!isHelloPlatformFrom(input.from)) {
    return { ok: true, skipped: true, reason: "not_hello_from" };
  }
  if (isHelloEmailGuardDisabled()) {
    return { ok: true, skipped: true, reason: "guard_disabled" };
  }

  const recipient = normalizeEmail(input.to);
  const dayBerlin = berlinCalendarDay(input.now);
  if (!recipient.includes("@")) {
    return { ok: true, skipped: true, reason: "invalid_recipient" };
  }

  let priorCount = 0;
  let approved = false;
  try {
    priorCount = await countPriorSends(recipient, dayBerlin);
    if (priorCount === 0) {
      return { ok: true, skipped: false, recipient, dayBerlin, priorCount, approved: false };
    }

    const envAllow = parseSecondSendAllowlist(
      process.env.HELLO_EMAIL_SECOND_SEND_ALLOW,
      dayBerlin,
    );
    approved = envAllow.has(recipient) || (await hasDbApproval(recipient, dayBerlin));
  } catch (error) {
    console.error("[hello-email-guard] lookup failed", error);
    await logBlockedAttempt({
      recipient,
      dayBerlin,
      subject: input.subject,
      feature: input.feature,
      reason: HELLO_GUARD_UNAVAILABLE,
      priorCount: 0,
    });
    return {
      ok: false,
      error: HELLO_GUARD_UNAVAILABLE,
      recipient,
      dayBerlin,
    };
  }

  if (!approved) {
    await logBlockedAttempt({
      recipient,
      dayBerlin,
      subject: input.subject,
      feature: input.feature,
      reason: HELLO_SAME_DAY_BLOCKED,
      priorCount,
    });
    return {
      ok: false,
      error: HELLO_SAME_DAY_BLOCKED,
      recipient,
      dayBerlin,
      priorCount,
    };
  }

  return { ok: true, skipped: false, recipient, dayBerlin, priorCount, approved: true };
}

/** Record a successful hello@ send so later same-day attempts can be blocked. */
export async function recordHelloEmailSent(input: {
  to: string;
  from: string;
  subject?: string;
  feature: string;
  resendId?: string | null;
  now?: Date;
}): Promise<void> {
  if (!isHelloPlatformFrom(input.from)) return;
  if (isHelloEmailGuardDisabled()) return;

  const recipient = normalizeEmail(input.to);
  if (!recipient.includes("@")) return;

  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from("hello_outbound_sends").insert({
      recipient_email: recipient,
      day_berlin: berlinCalendarDay(input.now),
      subject: input.subject ?? null,
      feature: input.feature,
      resend_id: input.resendId ?? null,
      from_header: input.from,
    });
  } catch (error) {
    console.error("[hello-email-guard] failed to record send", error);
  }
}
