import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { pollReceivedEmails } from "@/lib/inbound-email-process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await pollReceivedEmails(25);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Inbound email poll failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "poll_failed" },
      { status: 500 },
    );
  }
}
