import { Resend } from "resend";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { appendAgentMessage } from "@/lib/agent-messages";
import { ensureWorkspaceWebThread, getAgentThread, mergeAgentThreadMetadata } from "@/lib/agent-threads";
import { logAgentInteraction } from "@/lib/audit";
import { inboundReceivingDomain, isInboundReceivingAddress, parseEmailAddress, stripQuotes } from "@/lib/email";
import {
  buildInboundNotice,
  collectRecipientAddresses,
  detectInboundIntent,
  excerptInboundBody,
  inboundBodyText,
  readPendingInbound,
  type MatchedDiver,
  type PendingInbound,
} from "@/lib/inbound-email";
import { isEmailConfigured } from "@/lib/feature-flags";

export type InboundEmailPreview = {
  email_id?: string;
  id?: string;
  from?: string;
  to?: string[];
  received_for?: string[];
  subject?: string;
  created_at?: string;
  text?: string | null;
  html?: string | null;
};

function getResend() {
  const key = stripQuotes(process.env.RESEND_API_KEY || "");
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  return new Resend(key);
}

export async function loadPendingInboundForUser(userId: string): Promise<PendingInbound | null> {
  await maybePollReceivedEmails();
  const supabase = createServiceSupabaseClient();
  const thread = await getAgentThread(supabase, "web", userId);
  const pending = readPendingInbound(thread?.metadata ?? null);
  return pending?.status === "pending" ? pending : null;
}

async function alreadyProcessed(emailId: string) {
  const supabase = createServiceSupabaseClient();
  const { data } = await supabase
    .from("ai_interactions")
    .select("id")
    .eq("feature", "inbound_email")
    .contains("output", { email_id: emailId })
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function fetchReceivedEmail(emailId: string) {
  const resend = getResend();
  const { data, error } = await resend.emails.receiving.get(emailId);
  if (error || !data) {
    return null;
  }
  return data;
}

async function matchDiverFromRecentOutbound(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  fromAddress: string,
): Promise<MatchedDiver | null> {
  const { data: recent } = await supabase
    .from("ai_interactions")
    .select("actor_id, input, created_at")
    .eq("feature", "hermes_send_email")
    .order("created_at", { ascending: false })
    .limit(40);

  for (const row of recent ?? []) {
    if (!row.actor_id) continue;
    try {
      const parsed = JSON.parse(typeof row.input === "string" ? row.input : JSON.stringify(row.input)) as {
        to?: unknown;
      };
      if (String(parsed.to ?? "").trim().toLowerCase() !== fromAddress) continue;
      const { data } = await supabase
        .from("users")
        .select("id, email, username, full_name, role")
        .eq("id", row.actor_id)
        .maybeSingle();
      if (data) return data as MatchedDiver;
    } catch {
      // Ignore malformed audit rows.
    }
  }

  return null;
}

async function matchDiver(input: {
  from: string;
  to: string[];
  received_for: string[];
}): Promise<MatchedDiver | null> {
  const supabase = createServiceSupabaseClient();
  const recipients = collectRecipientAddresses(input);
  const fromAddress = parseEmailAddress(input.from);

  for (const address of recipients) {
    if (!isInboundReceivingAddress(address)) continue;
    const local = address.slice(0, address.lastIndexOf("@"));
    const { data } = await supabase
      .from("users")
      .select("id, email, username, full_name, role")
      .eq("username", local)
      .eq("role", "diver")
      .maybeSingle();
    if (data) return data as MatchedDiver;
  }

  // Catch-all inbound addresses such as hello@inbound.doneunder.ai.
  if (recipients.some((address) => isInboundReceivingAddress(address))) {
    const viaOutbound = await matchDiverFromRecentOutbound(supabase, fromAddress);
    if (viaOutbound) return viaOutbound;
  }

  for (const address of recipients) {
    const { data } = await supabase
      .from("users")
      .select("id, email, username, full_name, role")
      .eq("email", address)
      .eq("role", "diver")
      .maybeSingle();
    if (data) return data as MatchedDiver;
  }

  return matchDiverFromRecentOutbound(supabase, fromAddress);
}

function pendingFromParsed(input: {
  emailId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}): PendingInbound {
  return {
    from: parseEmailAddress(input.from),
    subject: input.subject.trim() || "(no subject)",
    intent: detectInboundIntent(input.subject, input.body),
    emailId: input.emailId,
    bodyExcerpt: excerptInboundBody(input.body),
    status: "pending",
    receivedAt: input.receivedAt,
  };
}

export async function processInboundEmail(input: {
  emailId: string;
  preview?: InboundEmailPreview | null;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string; diverId?: string }> {
  const emailId = input.emailId.trim();
  if (!emailId) return { ok: false, reason: "missing_email_id" };
  if (await alreadyProcessed(emailId)) {
    return { ok: true, skipped: true, reason: "duplicate" };
  }

  const fetched = await fetchReceivedEmail(emailId).catch(() => null);
  const from = fetched?.from || input.preview?.from || "";
  const to = fetched?.to ?? input.preview?.to ?? [];
  const receivedFor = fetched?.received_for ?? input.preview?.received_for ?? [];
  const subject = fetched?.subject || input.preview?.subject || "(no subject)";
  const body = inboundBodyText({
    text: fetched?.text ?? input.preview?.text,
    html: fetched?.html ?? input.preview?.html,
  });
  const receivedAt = fetched?.created_at || input.preview?.created_at || new Date().toISOString();

  if (!from) {
    return { ok: false, reason: "missing_from" };
  }

  const diver = await matchDiver({ from, to, received_for: receivedFor });
  if (!diver) {
    await logAgentInteraction({
      actorId: null,
      feature: "inbound_email",
      input: { emailId, from, to, receivedFor, subject },
      output: { email_id: emailId, matched: false },
    });
    return { ok: true, skipped: true, reason: "unmatched" };
  }

  const supabase = createServiceSupabaseClient();
  const pending = pendingFromParsed({ emailId, from, subject, body, receivedAt });
  const thread = await ensureWorkspaceWebThread(supabase, diver.id, "diver");
  const notice = buildInboundNotice(pending);

  await appendAgentMessage(supabase, {
    threadId: thread.id,
    role: "assistant",
    content: notice,
    metadata: {
      source: "inbound_email",
      inboundEmailId: emailId,
      from: pending.from,
      intent: pending.intent,
    },
  });

  await mergeAgentThreadMetadata(supabase, thread.id, {
    pending_inbound: pending,
  });

  await logAgentInteraction({
    actorId: diver.id,
    feature: "inbound_email",
    input: { emailId, from: pending.from, to, subject, intent: pending.intent },
    output: { email_id: emailId, matched: true, threadId: thread.id, intent: pending.intent },
  });

  return { ok: true, diverId: diver.id };
}

export async function pollReceivedEmails(limit = 20) {
  if (!isEmailConfigured()) {
    return { ok: false, error: "email_not_configured", processed: 0 };
  }

  const resend = getResend();
  const { data, error } = await resend.emails.receiving.list({ limit });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "list_failed", processed: 0 };
  }

  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const results: Array<{ emailId: string; ok: boolean; reason?: string }> = [];

  for (const item of receivingListItems(data)) {
    const created = item.created_at ? Date.parse(item.created_at) : Date.now();
    if (Number.isFinite(created) && created < cutoff) continue;
    const processed = await processInboundEmail({
      emailId: item.id,
      preview: {
        id: item.id,
        email_id: item.id,
        from: item.from,
        to: item.to,
        received_for: item.received_for,
        subject: item.subject,
        created_at: item.created_at,
      },
    });
    results.push({ emailId: item.id, ok: processed.ok, reason: processed.reason });
  }

  return {
    ok: true,
    processed: results.filter((item) => item.ok && !item.reason).length,
    results,
  };
}

let lastInboundPollAt = 0;
let inboundPollInFlight: Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  processed?: number;
  error?: string;
}> | null = null;

/**
 * Hobby plans cannot run a frequent cron, and Resend webhooks can miss events.
 * Pull received mail when a signed-in diver opens the site or workspace.
 */
export async function maybePollReceivedEmails(minIntervalMs = 45_000) {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true, reason: "email_not_configured" };
  }
  if (Date.now() - lastInboundPollAt < minIntervalMs) {
    return { ok: true, skipped: true, reason: "throttled" };
  }
  if (inboundPollInFlight) return inboundPollInFlight;

  inboundPollInFlight = (async () => {
    lastInboundPollAt = Date.now();
    try {
      const result = await pollReceivedEmails(20);
      console.info("inbound poll", {
        ok: result.ok,
        processed: result.processed,
        error: "error" in result ? result.error : undefined,
        results: "results" in result ? result.results : undefined,
      });
      return result;
    } catch (error) {
      console.error("inbound poll failed:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "poll_failed",
        processed: 0,
      };
    } finally {
      inboundPollInFlight = null;
    }
  })();

  return inboundPollInFlight;
}

function receivingListItems(data: unknown): Array<{
  id: string;
  from?: string;
  to?: string[];
  received_for?: string[];
  subject?: string;
  created_at?: string;
}> {
  if (Array.isArray(data)) return data as ReturnType<typeof receivingListItems>;
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: ReturnType<typeof receivingListItems> }).data;
  }
  return [];
}

export async function inspectInboundReceiving() {
  if (!isEmailConfigured()) {
    return { ok: false as const, error: "email_not_configured" };
  }

  const resend = getResend();
  const listed = await resend.emails.receiving.list({ limit: 20 });
  const items = receivingListItems(listed.data);
  const domains = await resend.domains.list({ limit: 10 });
  const domainRows = [];

  for (const domain of domains.data?.data ?? []) {
    const detail = await resend.domains.get(domain.id);
    const records = (detail.data?.records ?? [])
      .filter((record) => record.record === "Receiving")
      .map((record) => ({
        name: record.name,
        value: record.value,
        status: record.status,
        priority: "priority" in record ? record.priority : null,
      }));
    domainRows.push({
      name: domain.name,
      region: domain.region,
      status: domain.status,
      receiving: domain.capabilities?.receiving ?? null,
      receivingRecords: records,
    });
  }

  return {
    ok: true as const,
    inboundDomain: inboundReceivingDomain(),
    receivedCount: items.length,
    listError: listed.error?.message ?? null,
    latestReceivedAt: items[0]?.created_at ?? null,
    domains: domainRows,
    domainListError: domains.error?.message ?? null,
  };
}
