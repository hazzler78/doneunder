import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { oauthForwardPath } from "@/lib/auth-paths";
import { isSupabaseConfigured } from "@/lib/feature-flags";

/**
 * Refreshes the Supabase session from cookies on each request.
 * Required for reliable server-side auth after sign-in (see Supabase Next.js SSR guide).
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

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
