import { NextResponse } from "next/server";
import { z } from "zod";
import { clampLeadDays, DEFAULT_LEAD_DAYS } from "@/lib/cert-expiry";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";

const patchSchema = z.object({
  enabled: z.boolean(),
  leadDays: z.number().int().min(1).max(365),
});

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const { data, error } = await authResult.supabase
      .from("diver_profiles")
      .select("cert_reminders_enabled, cert_reminder_lead_days")
      .eq("user_id", authResult.diverId)
      .maybeSingle();
    if (error) {
      console.error("Reminder settings read failed:", error.code);
      return NextResponse.json({ error: "Could not load reminder settings." }, { status: 500 });
    }

    return NextResponse.json({
      enabled: data?.cert_reminders_enabled !== false,
      leadDays: clampLeadDays(typeof data?.cert_reminder_lead_days === "number" ? data.cert_reminder_lead_days : DEFAULT_LEAD_DAYS),
    });
  } catch {
    return NextResponse.json({ error: "Could not load reminder settings." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = patchSchema.parse(await req.json());
    const leadDays = clampLeadDays(body.leadDays);
    const { error } = await authResult.supabase
      .from("diver_profiles")
      .update({
        cert_reminders_enabled: body.enabled,
        cert_reminder_lead_days: leadDays,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", authResult.diverId);
    if (error) {
      console.error("Reminder settings update failed:", error.code);
      return NextResponse.json({ error: "Could not save reminder settings." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enabled: body.enabled, leadDays });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Choose between 1 and 365 days." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save reminder settings." }, { status: 500 });
  }
}
