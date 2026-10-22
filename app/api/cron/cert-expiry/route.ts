import { NextResponse } from "next/server";
import { ensureWorkspaceWebThread } from "@/lib/agent-threads";
import {
  planCertExpiryReminders,
  publicReminderSummary,
  reminderEmailCopy,
  reminderLogContent,
  reminderSentKey,
  type ReminderCandidate,
  type ReminderStep,
} from "@/lib/cert-expiry";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendPlatformEmail } from "@/lib/email";
import { isEmailConfigured } from "@/lib/feature-flags";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CertRow = {
  id: string;
  diver_id: string;
  name: string;
  expiry_date: string | null;
  expiry_confirmed: boolean | null;
};

type UserRow = {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  role: string;
};

type ProfileRow = {
  user_id: string;
  cert_reminders_enabled: boolean | null;
  cert_reminder_lead_days: number | null;
};

function sentKeyFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata || metadata.source !== "cert_expiry_reminder") return null;
  const diverId = typeof metadata.diver_id === "string" ? metadata.diver_id : "";
  const certName = typeof metadata.cert_name_key === "string" ? metadata.cert_name_key : "";
  const expiryDate = typeof metadata.expiry_date === "string" ? metadata.expiry_date : "";
  const step = metadata.step;
  if (!diverId || !certName || !expiryDate) return null;
  if (step !== "lead" && step !== "7" && step !== "0") return null;
  return reminderSentKey({ diverId, certName, expiryDate, step });
}

async function loadCandidates(): Promise<ReminderCandidate[]> {
  const supabase = createServiceSupabaseClient();
  const { data: profiles, error: profileError } = await supabase
    .from("diver_profiles")
    .select("user_id, cert_reminders_enabled, cert_reminder_lead_days");
  if (profileError) throw new Error("profile_read_failed");
  const profileRows = (profiles ?? []) as ProfileRow[];
  if (profileRows.length === 0) return [];

  const ids = profileRows.map((row) => row.user_id);
  const [{ data: users, error: userError }, { data: certs, error: certError }, { data: logs, error: logError }] =
    await Promise.all([
      supabase.from("users").select("id, email, username, full_name, role").in("id", ids),
      supabase
        .from("diver_certifications")
        .select("id, diver_id, name, expiry_date, expiry_confirmed")
        .in("diver_id", ids),
      supabase.from("agent_messages").select("metadata").contains("metadata", { source: "cert_expiry_reminder" }),
    ]);
  if (userError || certError || logError) throw new Error("reminder_read_failed");

  const usersById = new Map(((users ?? []) as UserRow[]).map((row) => [row.id, row]));
  const certsByDiver = new Map<string, CertRow[]>();
  for (const cert of (certs ?? []) as CertRow[]) {
    const list = certsByDiver.get(cert.diver_id) ?? [];
    list.push(cert);
    certsByDiver.set(cert.diver_id, list);
  }
  const sentKeys = ((logs ?? []) as Array<{ metadata: Record<string, unknown> | null }>)
    .map((row) => sentKeyFromMetadata(row.metadata))
    .filter((key): key is string => Boolean(key));

  return profileRows
    .map((profile) => {
      const user = usersById.get(profile.user_id);
      if (!user || user.role !== "diver") return null;
      const mine = sentKeys.filter((key) => key.startsWith(`${profile.user_id}|`));
      return {
        diverId: profile.user_id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        enabled: profile.cert_reminders_enabled !== false,
        leadDays: profile.cert_reminder_lead_days ?? 30,
        certs: (certsByDiver.get(profile.user_id) ?? []).map((cert) => ({
          id: cert.id,
          name: cert.name,
          expiryDate: cert.expiry_date,
          confirmed: cert.expiry_confirmed !== false,
        })),
        sentKeys: mine,
      } satisfies ReminderCandidate;
    })
    .filter((row): row is ReminderCandidate => row !== null);
}

async function claimReminder(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  input: {
    threadId: string;
    diverId: string;
    certificationId: string;
    certName: string;
    certNameKey: string;
    expiryDate: string;
    step: ReminderStep;
    daysUntil: number;
  },
) {
  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      thread_id: input.threadId,
      role: "system",
      content: reminderLogContent(input),
      metadata: {
        source: "cert_expiry_reminder",
        diver_id: input.diverId,
        certification_id: input.certificationId,
        cert_name_key: input.certNameKey,
        expiry_date: input.expiryDate,
        step: input.step,
      },
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") return { claimed: false as const };
  if (error || !data) return { claimed: false as const, failed: true as const };
  return { claimed: true as const, id: data.id as string };
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  try {
    const planned = planCertExpiryReminders(await loadCandidates());
    const summaries = planned.map(publicReminderSummary);
    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, count: summaries.length, reminders: summaries });
    }
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { ok: false, error: "email_not_configured", count: summaries.length, reminders: summaries },
        { status: 503 },
      );
    }

    const supabase = createServiceSupabaseClient();
    const sent = [];
    const failed = [];
    let skipped = 0;

    for (const item of planned) {
      const summary = publicReminderSummary(item);
      try {
        const thread = await ensureWorkspaceWebThread(supabase, item.diverId, "diver");
        const claim = await claimReminder(supabase, {
          threadId: thread.id,
          diverId: item.diverId,
          certificationId: item.certificationId,
          certName: item.certName,
          certNameKey: item.certNameKey,
          expiryDate: item.expiryDate,
          step: item.step,
          daysUntil: item.daysUntil,
        });
        if (!claim.claimed) {
          if ("failed" in claim) failed.push(summary);
          else skipped += 1;
          continue;
        }

        try {
          const copy = reminderEmailCopy(item);
          const delivery = await sendPlatformEmail({ to: item.email, subject: copy.subject, body: copy.body });
          if (!delivery.ok) {
            await supabase.from("agent_messages").delete().eq("id", claim.id);
            failed.push(summary);
            continue;
          }
          sent.push(summary);
        } catch {
          await supabase.from("agent_messages").delete().eq("id", claim.id);
          failed.push(summary);
        }
      } catch {
        failed.push(summary);
      }
    }

    return NextResponse.json({
      ok: failed.length === 0,
      dryRun: false,
      sent,
      skipped,
      failed,
    });
  } catch (error) {
    console.error("Cert expiry cron failed:", error instanceof Error ? error.message : "failed");
    return NextResponse.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}
