import { isSupabaseConfigured } from "@/lib/feature-flags";
import { safeInternalPath } from "@/lib/auth-paths";
import { createSupabaseRouteClient, redirectWithCookies } from "@/lib/supabase/route-handler";
import { SITE_URL } from "@/lib/site";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin || SITE_URL;
  const next = safeInternalPath(url.searchParams.get("next"));
  const fail = (message: string) =>
    redirectWithCookies(`${origin}/login?message=${encodeURIComponent(message)}`, []);

  if (!isSupabaseConfigured()) {
    return fail("Sign-in is not configured yet.");
  }

  try {
    const { supabase, cookiesToSet } = createSupabaseRouteClient(request);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error || !data.url) {
      console.error("Google OAuth could not start:", error?.message ?? "no url");
      return fail(error?.message || "Google sign-in could not start.");
    }

    return redirectWithCookies(data.url, cookiesToSet);
  } catch (error) {
    console.error("Google OAuth route failed:", error);
    return fail("Google sign-in could not start.");
  }
}
