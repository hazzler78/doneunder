import { NextResponse } from "next/server";
import { Resend } from "resend";
import { inspectInboundReceiving, maybePollReceivedEmails, processInboundEmail } from "@/lib/inbound-email-process";
import { inboundReceivingDomain, stripQuotes } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function webhookHeaders(req: Request) {
  return {
    id: req.headers.get("svix-id") || req.headers.get("webhook-id") || "",
    timestamp: req.headers.get("svix-timestamp") || req.headers.get("webhook-timestamp") || "",
    signature: req.headers.get("svix-signature") || req.headers.get("webhook-signature") || "",
  };
}

export async function GET() {
  const webhookSecret = stripQuotes(process.env.RESEND_WEBHOOK_SECRET || "");
  const apiKey = stripQuotes(process.env.RESEND_API_KEY || "");
  const configured = Boolean(webhookSecret && apiKey);
  if (!configured) {
    return NextResponse.json({
      ok: false,
      inboundDomain: inboundReceivingDomain(),
      configured: false,
    });
  }

  try {
    const poll = await maybePollReceivedEmails(0);
    const receiving = await inspectInboundReceiving();
    return NextResponse.json({
      ok: receiving.ok,
      inboundDomain: inboundReceivingDomain(),
      configured: true,
      poll,
      receiving,
    });
  } catch (error) {
    console.error("Inbound health check failed:", error);
    return NextResponse.json(
      {
        ok: false,
        inboundDomain: inboundReceivingDomain(),
        configured: true,
        error: error instanceof Error ? error.message : "health_failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const webhookSecret = stripQuotes(process.env.RESEND_WEBHOOK_SECRET || "");
  const apiKey = stripQuotes(process.env.RESEND_API_KEY || "");
  if (!webhookSecret || !apiKey) {
    return NextResponse.json({ error: "Inbound webhook is not configured." }, { status: 503 });
  }

  const payload = await req.text();
  const headers = webhookHeaders(req);
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return NextResponse.json({ error: "Missing webhook signature headers." }, { status: 400 });
  }

  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    const resend = new Resend(apiKey);
    event = resend.webhooks.verify({
      payload,
      headers,
      webhookSecret,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Invalid webhook signature: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 },
    );
  }

  if (event.type !== "email.received") {
    console.info("inbound webhook ignored", event.type);
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  console.info("inbound webhook email.received", {
    emailId: event.data.email_id,
    from: event.data.from,
    to: event.data.to,
    receivedFor: event.data.received_for,
    subject: event.data.subject,
  });

  try {
    const result = await processInboundEmail({
      emailId: event.data.email_id,
      preview: {
        email_id: event.data.email_id,
        from: event.data.from,
        to: event.data.to,
        received_for: event.data.received_for,
        subject: event.data.subject,
        created_at: event.data.created_at,
      },
    });
    return NextResponse.json({
      received: true,
      processed: result.ok,
      skipped: result.skipped ?? false,
      reason: result.reason ?? null,
      diverId: result.diverId ?? null,
    });
  } catch (error) {
    console.error("Failed to process inbound email:", error);
    return NextResponse.json({ error: "Failed to process inbound email." }, { status: 500 });
  }
}
