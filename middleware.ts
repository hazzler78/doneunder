import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { oauthForwardPath } from "@/lib/auth-paths";
import { isSupabaseConfigured } from "@/lib/feature-flags";

/** Keep well under Vercel's middleware limit so a hung Auth call cannot 504 the site. */
const AUTH_REFRESH_MS = 2500;

/**
 * Refreshes the Supabase session from cookies on each request.
 * Required for reliable server-side auth after sign-in (see Supabase Next.js SSR guide).
 *
 * Auth is raced against a short timeout: if Supabase is slow/unreachable from the
 * edge region, the page still loads (session may be stale until the next request).
 */
export async function middleware(request: NextRequest) {
  const forwarded = oauthForwardPath(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (forwarded) {
    return NextResponse.redirect(new URL(forwarded, request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, { ...options, path: options?.path || "/" });
          });
        },
      },
    },
  );

  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("supabase_auth_timeout")), AUTH_REFRESH_MS);
      }),
    ]);
  } catch {
    // Fail open: never turn Auth latency into MIDDLEWARE_INVOCATION_TIMEOUT.
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match page navigations and cookie-auth APIs. Skip static assets, image
     * optimization, and bearer/webhook/cron APIs that do not need a session refresh.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|api/resend|api/agent|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
