import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentMessage } from "@/lib/agent-messages";
import { upsertWorkspaceThread } from "@/lib/agent-threads";
import { parseEmailAddress, stripQuotes } from "@/lib/email";
import { isEmailConfigured } from "@/lib/feature-flags";
import { isPublishNudgeSkipped } from "@/lib/publish-nudge-skip";
import { SITE_URL } from "@/lib/site";

export const PUBLISH_NUDGE_META = "publish_nudge_email";
export { isPublishNudgeSkipped };

const NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
/** Give divers a day after CV process before the first email. */
const MIN_AGE_AFTER_CV_MS = 24 * 60 * 60 * 1000;

export type PublishNudgeCandidate = {
  userId: string;
  email: string;
  fullName: string;
  username: string | null;
  headline: string;
  cvLastProcessedAt: string;
  lastNudgedAt: string | null;
};

export type PublishNudgeResult = {
  ok: true;
  dryRun: boolean;
  candidates: number;
  sent: Array<{ email: string; username: string | null; id?: string }>;
  skipped: Array<{ email: string; username: string | null; reason: string }>;
  errors: Array<{ email: string; username: string | null; error: string }>;
};

function displayName(fullName: string | null | undefined, username: string | null | undefined) {
  return fullName?.trim() || username?.trim() || "there";
}

function firstName(fullName: string) {
  const part = fullName.trim().split(/\s+/)[0];
  return part && part.toLowerCase() !== "there" ? part : fullName;
}

export function formatPublishNudgeEmail(input: {
  fullName: string;
  username: string | null;
  headline: string;
}) {
  const name = firstName(displayName(input.fullName, input.username));
  const publicHint = input.username
    ? `When you publish, contractors can open ${SITE_URL}/${input.username}.`
    : `When you publish, contractors can open your public DoneUnder page.`;
  const headlineLine = input.headline.trim()
    ? `\nYour draft headline right now:\n"${input.headline.trim()}"\n`
    : "";

  const text = `Hi ${name},

Your DoneUnder CV looks ready — it is still a draft, so contractors cannot see it yet.

Open your workspace and tap Publish page (or ask Hermes: “Publish my profile”). Preview first if you want to tweak anything.
${headlineLine}
Workspace: ${SITE_URL}/workspace
Preview: ${SITE_URL}/preview

${publicHint}

A clear face photo on the preview page helps the public card look finished, but you can publish without one.

— Hermes
doneunder.ai
`;

  const subject = "Your DoneUnder CV is ready — publish when you are";
  return { subject, text };
}

async function lastPublishNudgeAt(
  supabase: SupabaseClient,
  threadId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("agent_messages")
    .select("created_at, metadata")
    .eq("thread_id", threadId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(40);

  for (const row of data ?? []) {
    const meta =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    if (meta.source === PUBLISH_NUDGE_META) {
      return row.created_at;
    }
  }
  return null;
}

export async function listPublishNudgeCandidates(
  supabase: SupabaseClient,
  options?: { minAgeAfterCvMs?: number; cooldownMs?: number },
): Promise<PublishNudgeCandidate[]> {
  const minAge = options?.minAgeAfterCvMs ?? MIN_AGE_AFTER_CV_MS;
  const cooldown = options?.cooldownMs ?? NUDGE_COOLDOWN_MS;
  const now = Date.now();

  const { data: divers, error } = await supabase
    .from("users")
    .select("id, full_name, username, email, role")
    .eq("role", "diver")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const ids = (divers ?? []).map((d) => d.id);
  const { data: profiles } = ids.length
    ? await supabase
        .from("diver_profiles")
        .select(
          "user_id, profile_status, cv_last_processed_at, headline, ambassador_public_headline, polished_cv_markdown",
        )
        .in("user_id", ids)
    : { data: [] as never[] };

  const profileBy = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));
  const candidates: PublishNudgeCandidate[] = [];

  for (const diver of divers ?? []) {
    const username = diver.username?.trim().toLowerCase() || null;
    const email = diver.email?.trim().toLowerCase() || "";
    if (isPublishNudgeSkipped({ email, username })) continue;
    if (!email.includes("@")) continue;

    const profile = profileBy[diver.id];
    if (!profile || profile.profile_status !== "draft") continue;

    const cvAt = profile.cv_last_processed_at;
    if (!cvAt) continue;
    const cvAge = now - new Date(cvAt).getTime();
    if (!Number.isFinite(cvAge) || cvAge < minAge) continue;

    const headline = (
      profile.ambassador_public_headline ||
      profile.headline ||
      ""
    ).trim();
    const hasContent =
      headline.length > 0 || Boolean(String(profile.polished_cv_markdown || "").trim());
    if (!hasContent) continue;

    const thread = await upsertWorkspaceThread(supabase, {
      userId: diver.id,
      role: "diver",
      channel: "web",
      externalChatId: `web:${diver.id}`,
      metadata: { source: "publish-nudge" },
    });

    const lastNudgedAt = await lastPublishNudgeAt(supabase, thread.id);
    if (lastNudgedAt) {
      const since = now - new Date(lastNudgedAt).getTime();
      if (Number.isFinite(since) && since < cooldown) continue;
    }

    candidates.push({
      userId: diver.id,
      email,
      fullName: displayName(diver.full_name, diver.username),
      username,
      headline,
      cvLastProcessedAt: cvAt,
      lastNudgedAt,
    });
  }

  return candidates;
}

export async function sendPublishNudges(
  supabase: SupabaseClient,
  options?: { dryRun?: boolean; minAgeAfterCvMs?: number; cooldownMs?: number },
): Promise<PublishNudgeResult> {
  const dryRun = Boolean(options?.dryRun);
  const candidates = await listPublishNudgeCandidates(supabase, options);
  const sent: PublishNudgeResult["sent"] = [];
  const skipped: PublishNudgeResult["skipped"] = [];
  const errors: PublishNudgeResult["errors"] = [];

  if (!dryRun && !isEmailConfigured()) {
    return {
      ok: true,
      dryRun,
      candidates: candidates.length,
      sent,
      skipped: candidates.map((c) => ({
        email: c.email,
        username: c.username,
        reason: "email_not_configured",
      })),
      errors,
    };
  }

  const fromEnv = stripQuotes(process.env.RESEND_FROM_EMAIL || "Hermes <hello@doneunder.ai>");
  const fromAddress = parseEmailAddress(fromEnv);
  const from = `Hermes <${fromAddress}>`;
  const resend = dryRun ? null : new Resend(stripQuotes(process.env.RESEND_API_KEY!));

  for (const candidate of candidates) {
    const { subject, text } = formatPublishNudgeEmail(candidate);

    if (dryRun) {
      sent.push({ email: candidate.email, username: candidate.username, id: "dry_run" });
      continue;
    }

    try {
      const { data, error } = await resend!.emails.send({
        from,
        to: [candidate.email],
        replyTo: "hello@doneunder.ai",
        subject,
        text,
      });
      if (error) {
        errors.push({
          email: candidate.email,
          username: candidate.username,
          error: error.message,
        });
        continue;
      }

      const thread = await upsertWorkspaceThread(supabase, {
        userId: candidate.userId,
        role: "diver",
        channel: "web",
        externalChatId: `web:${candidate.userId}`,
      });

      await appendAgentMessage(supabase, {
        threadId: thread.id,
        role: "assistant",
        content:
          "I emailed you a short reminder: your CV is still a draft. Open workspace and use Publish page when you want contractors to see it.",
        metadata: {
          source: PUBLISH_NUDGE_META,
          emailId: data?.id ?? null,
          to: candidate.email,
        },
      });

      sent.push({
        email: candidate.email,
        username: candidate.username,
        id: data?.id ?? "sent",
      });
    } catch (error) {
      errors.push({
        email: candidate.email,
        username: candidate.username,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: true,
    dryRun,
    candidates: candidates.length,
    sent,
    skipped,
    errors,
  };
}
