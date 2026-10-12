import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentMessage } from "@/lib/agent-messages";
import { upsertWorkspaceThread } from "@/lib/agent-threads";
import { parseEmailAddress, stripQuotes } from "@/lib/email";
import { isEmailConfigured } from "@/lib/feature-flags";
import { isJobOpen, loadAppliedJobIds, loadOpenJobs, workspaceMatchHref, type PublicJob } from "@/lib/jobs";
import { isPublishNudgeSkipped } from "@/lib/publish-nudge-skip";
import { SITE_URL } from "@/lib/site";

export const JOB_ALERT_META = "job_alert_email";

/** Only alert on campaigns posted within this window (avoids flooding new divers with old board noise). */
const DEFAULT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type JobAlertDiver = {
  userId: string;
  email: string;
  fullName: string;
  username: string | null;
};

export type JobAlertSend = {
  email: string;
  username: string | null;
  jobId: string;
  id?: string;
};

export type JobAlertResult = {
  ok: true;
  dryRun: boolean;
  alertableJobs: number;
  divers: number;
  sent: JobAlertSend[];
  skipped: Array<{ email: string; username: string | null; jobId: string; reason: string }>;
  errors: Array<{ email: string; username: string | null; jobId: string; error: string }>;
};

function displayName(fullName: string | null | undefined, username: string | null | undefined) {
  return fullName?.trim() || username?.trim() || "there";
}

function firstName(fullName: string) {
  const part = fullName.trim().split(/\s+/)[0];
  return part && part.toLowerCase() !== "there" ? part : fullName;
}

/** True when a job should trigger outbound alerts (open + has postedAt within max age). */
export function isJobAlertable(
  job: Pick<PublicJob, "status" | "closesAt" | "postedAt">,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): boolean {
  if (!isJobOpen(job, now)) return false;
  const posted = job.postedAt?.trim();
  if (!posted) return false;
  const age = now.getTime() - new Date(posted).getTime();
  if (!Number.isFinite(age) || age < 0) return false;
  return age <= maxAgeMs;
}

export function formatJobAlertEmail(input: {
  fullName: string;
  username: string | null;
  job: Pick<PublicJob, "id" | "title" | "location" | "scope" | "mobilization" | "requiredCerts" | "closesAt">;
}) {
  const name = firstName(displayName(input.fullName, input.username));
  const job = input.job;
  const matchUrl = `${SITE_URL}${workspaceMatchHref(job.id)}`;
  const tickets = job.requiredCerts.length ? job.requiredCerts.join(", ") : "not listed";
  const closeLine = job.closesAt
    ? `Apply by: ${new Date(job.closesAt).toISOString().slice(0, 10)}`
    : null;

  const text = `Hi ${name},

A new campaign is on the DoneUnder board:

${job.title}
${job.location} · ${job.scope}${job.mobilization ? ` · mobilise ${job.mobilization}` : ""}
Required tickets: ${tickets}
${closeLine ? `${closeLine}\n` : ""}
Open your workspace to match (and apply if your tickets are current):
${matchUrl}

Or ask Hermes in chat: “Match me to ${job.title}”.

— Hermes
doneunder.ai
`;

  const subject = `New job: ${job.title}`;
  return { subject, text };
}

export function formatJobAlertHermesMessage(
  job: Pick<PublicJob, "id" | "title" | "location" | "scope">,
) {
  return (
    `New campaign on the board: **${job.title}** (${job.location}, ${job.scope}). ` +
    `Say “match me to this job” (job id ${job.id}) and I’ll check your tickets before you apply.`
  );
}

async function alreadyAlertedJobIds(
  supabase: SupabaseClient,
  threadId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("agent_messages")
    .select("metadata")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(80);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const meta =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    if (meta.source === JOB_ALERT_META && typeof meta.jobId === "string" && meta.jobId.trim()) {
      ids.add(meta.jobId.trim());
    }
  }
  return ids;
}

export async function listJobAlertDivers(supabase: SupabaseClient): Promise<JobAlertDiver[]> {
  const { data: divers, error } = await supabase
    .from("users")
    .select("id, full_name, username, email, role")
    .eq("role", "diver")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);

  const ids = (divers ?? []).map((d) => d.id);
  const { data: profiles } = ids.length
    ? await supabase
        .from("diver_profiles")
        .select("user_id, cv_last_processed_at, polished_cv_markdown")
        .in("user_id", ids)
    : { data: [] as never[] };

  const profileBy = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));
  const out: JobAlertDiver[] = [];

  for (const diver of divers ?? []) {
    const username = diver.username?.trim().toLowerCase() || null;
    const email = diver.email?.trim().toLowerCase() || "";
    if (isPublishNudgeSkipped({ email, username })) continue;
    if (!email.includes("@")) continue;

    const profile = profileBy[diver.id];
    if (!profile) continue;
    const hasCv =
      Boolean(profile.cv_last_processed_at) ||
      Boolean(String(profile.polished_cv_markdown || "").trim());
    if (!hasCv) continue;

    out.push({
      userId: diver.id,
      email,
      fullName: displayName(diver.full_name, diver.username),
      username,
    });
  }

  return out;
}

export async function sendJobAlerts(
  supabase: SupabaseClient,
  options?: { dryRun?: boolean; maxAgeMs?: number; now?: Date },
): Promise<JobAlertResult> {
  const dryRun = Boolean(options?.dryRun);
  const now = options?.now ?? new Date();
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  const openJobs = await loadOpenJobs(supabase, now);
  const alertableJobs = openJobs.filter((job) => isJobAlertable(job, now, maxAgeMs));
  const divers = await listJobAlertDivers(supabase);

  const sent: JobAlertResult["sent"] = [];
  const skipped: JobAlertResult["skipped"] = [];
  const errors: JobAlertResult["errors"] = [];

  if (alertableJobs.length === 0 || divers.length === 0) {
    return {
      ok: true,
      dryRun,
      alertableJobs: alertableJobs.length,
      divers: divers.length,
      sent,
      skipped,
      errors,
    };
  }

  if (!dryRun && !isEmailConfigured()) {
    for (const diver of divers) {
      for (const job of alertableJobs) {
        skipped.push({
          email: diver.email,
          username: diver.username,
          jobId: job.id,
          reason: "email_not_configured",
        });
      }
    }
    return {
      ok: true,
      dryRun,
      alertableJobs: alertableJobs.length,
      divers: divers.length,
      sent,
      skipped,
      errors,
    };
  }

  const fromEnv = stripQuotes(process.env.RESEND_FROM_EMAIL || "Hermes <hello@doneunder.ai>");
  const fromAddress = parseEmailAddress(fromEnv);
  const from = `Hermes <${fromAddress}>`;
  const resend = dryRun ? null : new Resend(stripQuotes(process.env.RESEND_API_KEY!));

  for (const diver of divers) {
    const thread = await upsertWorkspaceThread(supabase, {
      userId: diver.userId,
      role: "diver",
      channel: "web",
      externalChatId: `web:${diver.userId}`,
      metadata: { source: "job-alert" },
    });

    const alerted = await alreadyAlertedJobIds(supabase, thread.id);
    const applied = await loadAppliedJobIds(supabase, diver.userId);

    for (const job of alertableJobs) {
      if (alerted.has(job.id)) {
        skipped.push({
          email: diver.email,
          username: diver.username,
          jobId: job.id,
          reason: "already_alerted",
        });
        continue;
      }
      if (applied.has(job.id)) {
        skipped.push({
          email: diver.email,
          username: diver.username,
          jobId: job.id,
          reason: "already_applied",
        });
        continue;
      }

      const { subject, text } = formatJobAlertEmail({
        fullName: diver.fullName,
        username: diver.username,
        job,
      });
      const hermesContent = formatJobAlertHermesMessage(job);

      if (dryRun) {
        sent.push({
          email: diver.email,
          username: diver.username,
          jobId: job.id,
          id: "dry_run",
        });
        continue;
      }

      try {
        const { data, error } = await resend!.emails.send({
          from,
          to: [diver.email],
          replyTo: "hello@doneunder.ai",
          subject,
          text,
        });
        if (error) {
          errors.push({
            email: diver.email,
            username: diver.username,
            jobId: job.id,
            error: error.message,
          });
          continue;
        }

        await appendAgentMessage(supabase, {
          threadId: thread.id,
          role: "assistant",
          content: hermesContent,
          metadata: {
            source: JOB_ALERT_META,
            jobId: job.id,
            emailId: data?.id ?? null,
            to: diver.email,
          },
        });

        alerted.add(job.id);
        sent.push({
          email: diver.email,
          username: diver.username,
          jobId: job.id,
          id: data?.id ?? "sent",
        });
      } catch (error) {
        errors.push({
          email: diver.email,
          username: diver.username,
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    ok: true,
    dryRun,
    alertableJobs: alertableJobs.length,
    divers: divers.length,
    sent,
    skipped,
    errors,
  };
}
