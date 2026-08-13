import { NextResponse } from "next/server";
import { pollReceivedEmails } from "@/lib/inbound-email-process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCron(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (secret) return auth === `Bearer ${secret}`;
  const userAgent = req.headers.get("user-agent") ?? "";
  if (userAgent.includes("vercel-cron")) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return process.env.NODE_ENV !== "production";
}

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
