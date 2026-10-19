import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteConnectedMailbox, listConnectedMailboxes } from "@/lib/mail/mailbox-store";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isGmailOAuthConfigured, isOutlookOAuthConfigured } from "@/lib/mail/config";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const service = createServiceSupabaseClient();
    const boxes = await listConnectedMailboxes(service, user.id);
    return NextResponse.json({
      ok: true,
      gmailConfigured: isGmailOAuthConfigured(),
      outlookConfigured: isOutlookOAuthConfigured(),
      mailboxes: boxes.map((box) => ({
        provider: box.provider,
        email: box.email,
        tokenExpiresAt: box.token_expires_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load mailbox status.",
        gmailConfigured: isGmailOAuthConfigured(),
        outlookConfigured: isOutlookOAuthConfigured(),
        mailboxes: [],
      },
      { status: 500 },
    );
  }
}

const disconnectSchema = z.object({
  provider: z.enum(["gmail", "outlook"]),
});

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = disconnectSchema.parse(await req.json());
    const service = createServiceSupabaseClient();
    await deleteConnectedMailbox(service, user.id, body.provider);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Disconnect failed." },
      { status: 500 },
    );
  }
}
