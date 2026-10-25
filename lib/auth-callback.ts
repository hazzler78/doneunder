import type { NextRequest } from "next/server";
import { resolvePostAuthDestination } from "@/lib/auth-recovery";
import { ensureDiverProfileForAuthUser } from "@/lib/diver-bootstrap";
import { createSupabaseRouteClient, redirectWithCookies } from "@/lib/supabase/route-handler";
import { SITE_URL } from "@/lib/site";

export type AuthCallbackOptions = {
  /** When set, skip workspace/admin routing and send here after code exchange. */
  forcedNext?: string;
};

export async function handleAuthCallbackGet(request: NextRequest, options: AuthCallbackOptions = {}) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const origin = url.origin || SITE_URL;

  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthError) {
    return redirectWithCookies(`${origin}/login?message=${encodeURIComponent(oauthError)}`, []);
  }

  if (!code) {
    return redirectWithCookies(
      `${origin}/login?message=${encodeURIComponent("Sign-in was cancelled.")}`,
      [],
    );
  }

  try {
    const { supabase, cookiesToSet, responseHeaders } = createSupabaseRouteClient(request);
    const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Auth code exchange failed:", error.message);
      return redirectWithCookies(
        `${origin}/login?message=${encodeURIComponent(error.message || "Sign-in failed.")}`,
        cookiesToSet,
        responseHeaders,
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return redirectWithCookies(
        `${origin}/login?message=${encodeURIComponent("Sign-in did not create a session.")}`,
        cookiesToSet,
        responseHeaders,
      );
    }

    let role = "diver";
    try {
      const profile = await ensureDiverProfileForAuthUser(user);
      role = profile?.role ?? "diver";
    } catch (error) {
      console.error("Failed to create diver profile after sign-in:", error);
    }

    const destination = resolvePostAuthDestination({
      nextRaw: url.searchParams.get("next"),
      typeRaw: url.searchParams.get("type"),
      accessToken: exchangeData.session?.access_token ?? null,
      role,
      forcedNext: options.forcedNext,
    });

    return redirectWithCookies(`${origin}${destination}`, cookiesToSet, responseHeaders);
  } catch (error) {
    console.error("Auth callback failed:", error);
    return redirectWithCookies(
      `${origin}/login?message=${encodeURIComponent("Sign-in failed.")}`,
      [],
    );
  }
}
