import type { NextRequest } from "next/server";
import { ensureDiverProfileForAuthUser } from "@/lib/diver-bootstrap";
import { safeInternalPath } from "@/lib/auth-paths";
import { createSupabaseRouteClient, redirectWithCookies } from "@/lib/supabase/route-handler";
import { SITE_URL } from "@/lib/site";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const origin = url.origin || SITE_URL;

  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthError) {
    return redirectWithCookies(`${origin}/login?message=${encodeURIComponent(oauthError)}`, []);
  }

  if (!code) {
    return redirectWithCookies(
      `${origin}/login?message=${encodeURIComponent("Google sign-in was cancelled.")}`,
      [],
    );
  }

  try {
    const { supabase, cookiesToSet, responseHeaders } = createSupabaseRouteClient(request);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Google OAuth exchange failed:", error.message);
      return redirectWithCookies(
        `${origin}/login?message=${encodeURIComponent(error.message || "Google sign-in failed.")}`,
        cookiesToSet,
        responseHeaders,
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return redirectWithCookies(
        `${origin}/login?message=${encodeURIComponent("Google sign-in did not create a session.")}`,
        cookiesToSet,
        responseHeaders,
      );
    }

    let role = "diver";
    try {
      const profile = await ensureDiverProfileForAuthUser(user);
      role = profile?.role ?? "diver";
    } catch (error) {
      console.error("Failed to create diver profile after Google sign-in:", error);
    }

    const next = role === "admin" ? "/dashboard/admin" : safeInternalPath(url.searchParams.get("next"));
    return redirectWithCookies(`${origin}${next}`, cookiesToSet, responseHeaders);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return redirectWithCookies(
      `${origin}/login?message=${encodeURIComponent("Google sign-in failed.")}`,
      [],
    );
  }
}

