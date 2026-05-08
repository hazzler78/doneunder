import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  username: z.string().min(2).max(80),
});

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Please sign in as a company account first." }, { status: 401 });
    }

    const { data: actor } = await supabase.from("users").select("id,role,full_name").eq("id", auth.user.id).maybeSingle();
    if (!actor || actor.role !== "company") {
      return NextResponse.json({ error: "Only company accounts can request full profiles." }, { status: 403 });
    }

    const { data: diverUser } = await supabase
      .from("users")
      .select("id,full_name")
      .eq("username", body.username)
      .eq("role", "diver")
      .maybeSingle();
    if (!diverUser) {
      return NextResponse.json({ error: "Diver profile not found." }, { status: 404 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
    }

    const serviceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await serviceClient.from("messages").insert({
      sender_id: actor.id,
      recipient_id: diverUser.id,
      body: `Profile request: ${actor.full_name} requested your full profile and contact details.`,
    });

    if (error) {
      return NextResponse.json({ error: "Could not create request message." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to submit profile request.", detail: String(error) }, { status: 500 });
  }
}
