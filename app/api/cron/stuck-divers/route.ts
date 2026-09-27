import { NextResponse } from "next/server";
import { stripQuotes } from "@/lib/email";
import { maybeSendStuckDiverAlert, runStuckDiverCheck } from "@/lib/stuck-divers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCron(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const webhookSecret = stripQuotes(process.env.RESEND_WEBHOOK_SECRET || "");
  if (webhookSecret && auth === `Bearer ${webhookSecret}`) return true;
  const userAgent = req.headers.get("user-agent") ?? "";
  if (userAgent.includes("vercel-cron")) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const sinceHours = Number(url.searchParams.get("hours") || "24");

  try {
    const report = await runStuckDiverCheck({
      sinceHours: Number.isFinite(sinceHours) && sinceHours > 0 ? sinceHours : 24,
    });
    const mail = dryRun
      ? { sent: false as const, reason: "dry_run" as const }
      : await maybeSendStuckDiverAlert(report);

    return NextResponse.json({
      ok: true,
      dryRun,
      findingCount: report.findingCount,
      actionCount: report.actionCount,
      repairs: report.repairs,
      findings: report.findings,
      mail,
    });
  } catch (error) {
    console.error("Stuck diver check failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "stuck_check_failed" },
      { status: 500 },
    );
  }
}
