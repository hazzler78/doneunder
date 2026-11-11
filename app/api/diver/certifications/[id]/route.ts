import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";
import { checkCertificateDates } from "@/lib/cert-lifetime";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    confirm: z.boolean().optional(),
    /** true = lifetime ticket (no expiry date needed), false = expires, null = decide from the name. */
    no_expiry: z.boolean().nullable().optional(),
  })
  .refine(
    (value) => value.expiry_date !== undefined || value.confirm === true || value.no_expiry !== undefined,
    { message: "Provide an expiry date, confirm the current one, or mark the ticket as no expiry." },
  );

type CertificationUpdate = {
  expiry_date?: string | null;
  expiry_confirmed: boolean;
  no_expiry?: boolean | null;
  updated_at: string;
};

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
      .select("id, name, issue_date")
      .eq("id", id)
      .eq("diver_id", authResult.diverId)
      .maybeSingle();
    if (readError) {
      console.error("Certificate read failed:", readError.code);
      return NextResponse.json({ error: "Could not update certificate." }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Unknown certificate." }, { status: 404 });

    const update: CertificationUpdate = {
      expiry_confirmed: true,
      updated_at: new Date().toISOString(),
    };
    if (body.no_expiry !== undefined) update.no_expiry = body.no_expiry;
    if (body.no_expiry === true) {
      // A lifetime ticket has no expiry. Clear any stored date unless the diver typed one in the same request.
      update.expiry_date = body.expiry_date ?? null;
    } else if (body.expiry_date !== undefined) {
      update.expiry_date = body.expiry_date;
    }

    if (update.expiry_date) {
      const check = checkCertificateDates({
        name: typeof existing.name === "string" ? existing.name : null,
        issue_date: typeof existing.issue_date === "string" ? existing.issue_date : null,
        expiry_date: update.expiry_date,
      });
      if (check.warning) {
        return NextResponse.json(
          { error: `That expiry is before the issue date (${existing.issue_date}). Check the date.` },
          { status: 400 },
        );
      }
    }

    const { data, error } = await authResult.supabase
      .from("diver_certifications")
      .update(update)
      .eq("id", id)
      .eq("diver_id", authResult.diverId)
      .select("id, name, issue_date, expiry_date, expiry_confirmed, no_expiry")
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
