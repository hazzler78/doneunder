import { ensureDiverProfileForAuthUser } from "@/lib/diver-bootstrap";
import { safeInternalPath } from "@/lib/auth-paths";
import { createSupabaseRouteClient, redirectWithCookies } from "@/lib/supabase/route-handler";
import { SITE_URL } from "@/lib/site";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin || SITE_URL;

  if (!code) {
    return redirectWithCookies(
      `${origin}/login?message=${encodeURIComponent("Google sign-in was cancelled.")}`,
      [],
    );
  }

  try {
    const { supabase, cookiesToSet } = createSupabaseRouteClient(request);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectWithCookies(
        `${origin}/login?message=${encodeURIComponent(error.message || "Google sign-in failed.")}`,
        cookiesToSet,
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

    const next = role === "admin" ? "/dashboard/admin" : safeInternalPath(url.searchParams.get("next"));
    return redirectWithCookies(`${origin}${next}`, cookiesToSet);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return redirectWithCookies(
      `${origin}/login?message=${encodeURIComponent("Google sign-in failed.")}`,
      [],
    );
  }
}

