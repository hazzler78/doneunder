import { NextResponse } from "next/server";
import { ensureDiverProfileForAuthUser } from "@/lib/diver-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(next: string | null) {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/workspace";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?message=${encodeURIComponent("Google sign-in was cancelled.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent(error.message || "Google sign-in failed.")}`,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role = "diver";
  try {
    if (user) {
      const profile = await ensureDiverProfileForAuthUser(user);
      role = profile?.role ?? "diver";
    }
  } catch (error) {
    console.error("Failed to create diver profile after Google sign-in:", error);
  }

  if (role === "admin") {
    return NextResponse.redirect(`${origin}/dashboard/admin`);
  }

  return NextResponse.redirect(`${origin}${safeNextPath(url.searchParams.get("next"))}`);
}
