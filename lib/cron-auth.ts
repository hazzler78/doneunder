import { stripQuotes } from "@/lib/email";

/** Shared gate for Vercel cron routes. Local dev stays open so dry-run can be curled. */
export function isAuthorizedCron(req: Request) {
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
