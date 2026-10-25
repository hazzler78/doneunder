import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";

const patchSchema = z.object({
  phone: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }),
});

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const { data, error } = await authResult.supabase
      .from("diver_profiles")
      .select("phone")
      .eq("user_id", authResult.diverId)
      .maybeSingle();
    if (error) {
      console.error("Contact settings read failed:", error.code);
      return NextResponse.json({ error: "Could not load contact settings." }, { status: 500 });
    }

    return NextResponse.json({ phone: data?.phone?.trim() || null });
  } catch {
    return NextResponse.json({ error: "Could not load contact settings." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = patchSchema.parse(await req.json());
    const { error } = await authResult.supabase
      .from("diver_profiles")
      .update({
        phone: body.phone,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", authResult.diverId);
    if (error) {
      console.error("Contact settings update failed:", error.code);
      return NextResponse.json({ error: "Could not save phone number." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, phone: body.phone });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Phone number is too long (max 40 characters)." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save phone number." }, { status: 500 });
  }
}
