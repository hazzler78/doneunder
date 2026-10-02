import { NextResponse } from "next/server";
import { canUseSchoolOutreach } from "@/lib/school-outreach-access";
import { listSchoolOutreachTargets, summarizeSchoolOutreach } from "@/lib/school-outreach";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("username, email")
      .eq("id", user.id)
      .maybeSingle();

    if (!canUseSchoolOutreach(userRow?.username, userRow?.email ?? user.email)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const service = createServiceSupabaseClient();
    const [summary, targets] = await Promise.all([
      summarizeSchoolOutreach(service),
      listSchoolOutreachTargets(service, {
        status:
          status === "todo" ||
          status === "contacted" ||
          status === "replied" ||
          status === "partner" ||
          status === "skip"
            ? status
            : "active",
        limit: 120,
      }),
    ]);

    return NextResponse.json({ ok: true, summary, targets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load school targets." },
      { status: 500 },
    );
  }
}
