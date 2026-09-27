import { Resend } from "resend";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { isEmailConfigured } from "@/lib/feature-flags";
import { parseEmailAddress, stripQuotes } from "@/lib/email";
import {
  isValidPublicUsername,
  repairInvalidPublicUsername,
} from "@/lib/usernames";

export type StuckDiverFinding = {
  kind:
    | "new_registration"
    | "email_username_repaired"
    | "email_username"
    | "no_cv"
    | "draft_ready"
    | "stuck_message"
    | "unreadable_cv";
  severity: "info" | "action";
  userId: string;
  name: string;
  username: string | null;
  email: string | null;
  detail: string;
  at: string;
};

const STUCK_MESSAGE_RE =
  /\b(can'?t|cannot|unable|fail|error|help|stuck|attach|upload|pdf|doesn'?t work|do u have app)\b/i;

function alertInbox() {
  return stripQuotes(
    process.env.OPS_ALERT_EMAIL ||
      process.env.STUCK_DIVER_ALERT_EMAIL ||
      "hazzler@gmail.com",
  ).toLowerCase();
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function displayName(fullName: string | null | undefined, username: string | null | undefined) {
  return fullName?.trim() || username?.trim() || "Unknown diver";
}

export async function runStuckDiverCheck(options?: { sinceHours?: number }) {
  const sinceHours = options?.sinceHours ?? 24;
  const since = hoursAgoIso(sinceHours);
  const supabase = createServiceSupabaseClient();
  const findings: StuckDiverFinding[] = [];
  const repairs: Array<{ from: string | null; to: string; name: string }> = [];

  const { data: divers, error: diversError } = await supabase
    .from("users")
    .select("id, full_name, username, email, created_at, role")
    .eq("role", "diver")
    .order("created_at", { ascending: false })
    .limit(80);

  if (diversError) {
    throw new Error(`Failed to load divers: ${diversError.message}`);
  }

  const diverIds = (divers || []).map((d) => d.id);
  const { data: profiles } = diverIds.length
    ? await supabase
        .from("diver_profiles")
        .select("user_id, profile_status, cv_last_processed_at, published_at, updated_at, headline")
        .in("user_id", diverIds)
    : { data: [] as never[] };

  const profileByUser = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

  for (const diver of divers || []) {
    const username = diver.username?.trim() || null;
    if (username && !isValidPublicUsername(username)) {
      const repaired = await repairInvalidPublicUsername(supabase, {
        userId: diver.id,
        email: diver.email,
        currentUsername: username,
      });
      if (repaired.ok) {
        repairs.push({
          from: repaired.from,
          to: repaired.to,
          name: displayName(diver.full_name, repaired.to),
        });
        findings.push({
          kind: "email_username_repaired",
          severity: "info",
          userId: diver.id,
          name: displayName(diver.full_name, repaired.to),
          username: repaired.to,
          email: diver.email,
          detail: `Repaired public username ${repaired.from} → ${repaired.to}`,
          at: new Date().toISOString(),
        });
        diver.username = repaired.to;
      } else if (repaired.reason !== "already_valid") {
        findings.push({
          kind: "email_username",
          severity: "action",
          userId: diver.id,
          name: displayName(diver.full_name, username),
          username,
          email: diver.email,
          detail: `Invalid username still in use (${username}); repair failed: ${repaired.reason}`,
          at: diver.created_at,
        });
      }
    }
  }

  for (const diver of divers || []) {
    if (diver.created_at >= since) {
      const profile = profileByUser[diver.id];
      findings.push({
        kind: "new_registration",
        severity: "info",
        userId: diver.id,
        name: displayName(diver.full_name, diver.username),
        username: diver.username,
        email: diver.email,
        detail: `New diver · status ${profile?.profile_status ?? "no profile"} · CV ${
          profile?.cv_last_processed_at ? "yes" : "no"
        }`,
        at: diver.created_at,
      });
    }
  }

  for (const diver of divers || []) {
    const profile = profileByUser[diver.id];
    if (!profile) continue;
    const cvAt = profile.cv_last_processed_at;
    if (cvAt && cvAt >= since && profile.profile_status === "draft") {
      findings.push({
        kind: "draft_ready",
        severity: "action",
        userId: diver.id,
        name: displayName(diver.full_name, diver.username),
        username: diver.username,
        email: diver.email,
        detail: "CV processed in the last day but profile still draft — nudge publish",
        at: cvAt,
      });
    }
  }

  const { data: threads } = diverIds.length
    ? await supabase.from("agent_threads").select("id, user_id, diver_id").in("user_id", diverIds)
    : { data: [] as never[] };

  const threadById = Object.fromEntries((threads || []).map((t) => [t.id, t]));
  const threadIds = Object.keys(threadById);

  if (threadIds.length) {
    const { data: messages } = await supabase
      .from("agent_messages")
      .select("id, thread_id, role, content, metadata, created_at")
      .in("thread_id", threadIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const message of messages || []) {
      const thread = threadById[message.thread_id];
      const userId = thread?.user_id || thread?.diver_id;
      if (!userId) continue;
      const diver = (divers || []).find((d) => d.id === userId);
      if (!diver) continue;

      const meta =
        message.metadata && typeof message.metadata === "object"
          ? (message.metadata as Record<string, unknown>)
          : {};
      if (meta.unreadablePdf === true) {
        findings.push({
          kind: "unreadable_cv",
          severity: "action",
          userId: diver.id,
          name: displayName(diver.full_name, diver.username),
          username: diver.username,
          email: diver.email,
          detail: "Unreadable / scanned CV upload in the last day",
          at: message.created_at,
        });
        continue;
      }

      if (message.role !== "user") continue;
      const text = String(message.content || "");
      if (!STUCK_MESSAGE_RE.test(text)) continue;
      // Skip system-generated apply/process prompts
      if (/^Please process this CV PDF:/i.test(text)) continue;
      if (/^Apply me to this campaign/i.test(text)) continue;
      if (/^Match me to this campaign/i.test(text)) continue;
      if (/^Please store these certificate/i.test(text)) continue;

      findings.push({
        kind: "stuck_message",
        severity: "action",
        userId: diver.id,
        name: displayName(diver.full_name, diver.username),
        username: diver.username,
        email: diver.email,
        detail: text.replace(/\s+/g, " ").slice(0, 160),
        at: message.created_at,
      });
    }
  }

  // Divers registered > 1 day ago, still no CV, zero recent engagement — only if created in window
  // (already covered by new_registration). Add older empty profiles only when they messaged recently.
  for (const diver of divers || []) {
    const profile = profileByUser[diver.id];
    if (profile?.cv_last_processed_at) continue;
    if (diver.created_at >= since) continue; // already listed as new_registration
  }

  const deduped: StuckDiverFinding[] = [];
  const seen = new Set<string>();
  for (const finding of findings) {
    const key = `${finding.kind}:${finding.userId}:${finding.detail.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  const actionable = deduped.filter((f) => f.severity === "action");
  const shouldAlert = deduped.length > 0;

  return {
    ok: true as const,
    sinceHours,
    since,
    findingCount: deduped.length,
    actionCount: actionable.length,
    repairs,
    findings: deduped,
    shouldAlert,
    alertTo: alertInbox(),
  };
}

export function formatStuckDiverAlert(report: Awaited<ReturnType<typeof runStuckDiverCheck>>) {
  const lines = [
    `DoneUnder stuck-diver check (${report.sinceHours}h window)`,
    `Findings: ${report.findingCount} · Action needed: ${report.actionCount}`,
    "",
  ];

  if (report.repairs.length) {
    lines.push("Username repairs:");
    for (const repair of report.repairs) {
      lines.push(`- ${repair.name}: ${repair.from} → ${repair.to}`);
    }
    lines.push("");
  }

  for (const finding of report.findings) {
    const tag = finding.severity === "action" ? "ACTION" : "info";
    lines.push(
      `[${tag}] ${finding.kind} · ${finding.name} (@${finding.username || "—"})`,
    );
    lines.push(`  ${finding.detail}`);
    if (finding.email) lines.push(`  ${finding.email}`);
    lines.push(`  ${finding.at}`);
    lines.push("");
  }

  lines.push("Workspace: https://doneunder.ai/workspace");
  lines.push("— Hermes ops");
  return lines.join("\n");
}

export async function maybeSendStuckDiverAlert(
  report: Awaited<ReturnType<typeof runStuckDiverCheck>>,
) {
  if (!report.shouldAlert) {
    return { sent: false as const, reason: "no_findings" as const };
  }
  if (!isEmailConfigured()) {
    return { sent: false as const, reason: "email_not_configured" as const };
  }

  const to = report.alertTo;
  if (!to.includes("@")) {
    return { sent: false as const, reason: "bad_alert_inbox" as const };
  }

  const fromEnv = stripQuotes(process.env.RESEND_FROM_EMAIL || "DoneUnder <hello@doneunder.ai>");
  const fromAddress = parseEmailAddress(fromEnv);
  const from = `DoneUnder Ops <${fromAddress}>`;
  const subject =
    report.actionCount > 0
      ? `DoneUnder: ${report.actionCount} diver(s) need attention`
      : `DoneUnder: ${report.findingCount} diver update(s)`;

  const resend = new Resend(stripQuotes(process.env.RESEND_API_KEY!));
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: "hello@doneunder.ai",
    subject,
    text: formatStuckDiverAlert(report),
  });

  if (error) {
    return { sent: false as const, reason: error.message };
  }
  return { sent: true as const, id: data?.id ?? "sent", to, subject };
}
