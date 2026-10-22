import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    confirm: z.boolean().optional(),
  })
  .refine((value) => value.expiry_date !== undefined || value.confirm === true, {
    message: "Provide an expiry date or confirm the current one.",
  });

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Unknown certificate." }, { status: 404 });
    }

    const body = patchSchema.parse(await req.json());
    const { data: existing, error: readError } = await authResult.supabase
      .from("diver_certifications")
      .select("id")
      .eq("id", id)
      .eq("diver_id", authResult.diverId)
      .maybeSingle();
    if (readError) {
      console.error("Certificate read failed:", readError.code);
      return NextResponse.json({ error: "Could not update certificate." }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Unknown certificate." }, { status: 404 });

    const update: { expiry_date?: string | null; expiry_confirmed: boolean; updated_at: string } = {
      expiry_confirmed: true,
      updated_at: new Date().toISOString(),
    };
    if (body.expiry_date !== undefined) update.expiry_date = body.expiry_date;

    const { data, error } = await authResult.supabase
      .from("diver_certifications")
      .update(update)
      .eq("id", id)
      .eq("diver_id", authResult.diverId)
      .select("id, name, expiry_date, expiry_confirmed")
      .maybeSingle();
    if (error || !data) {
      console.error("Certificate update failed:", error?.code ?? "empty");
      return NextResponse.json({ error: "Could not update certificate." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, certification: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid expiry date." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update certificate." }, { status: 500 });
  }
}
