import { NextResponse } from "next/server";
import { z } from "zod";
import { listCvShareLinksForDiver, revokeCvShareLink } from "@/lib/cv-share-links";
import { getAuthenticatedDiverContext } from "@/lib/diver-auth";

export async function GET() {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const links = await listCvShareLinksForDiver(authResult.supabase, authResult.diverId);
    return NextResponse.json({ links });
  } catch {
    return NextResponse.json({ error: "Could not load CV share links." }, { status: 500 });
  }
}

const revokeSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const authResult = await getAuthenticatedDiverContext();
    if ("error" in authResult) return authResult.error;

    const body = revokeSchema.parse(await req.json());
    const result = await revokeCvShareLink(authResult.supabase, authResult.diverId, body.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Could not revoke link." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid link id." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not revoke link." }, { status: 500 });
  }
}
