import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/feature-flags";

export type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Session cookies must be visible on /workspace and /api/*, not only /auth/*. */
export function sessionCookieOptions(options?: CookieOptions): CookieOptions {
  const { encode: _encode, ...rest } = (options ?? {}) as CookieOptions & {
    encode?: (value: string) => string;
  };
  return {
    ...rest,
    path: "/",
    sameSite: rest.sameSite ?? "lax",
  };
}

export function createSupabaseRouteClient(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookiesToSet: CookieToSet[] = [];
  const responseHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(next, headers) {
          cookiesToSet.push(...next);
          if (headers) Object.assign(responseHeaders, headers);
        },
      },
    },
  );

  return { supabase, cookiesToSet, responseHeaders };
}

export function redirectWithCookies(
  url: string,
  cookiesToSet: CookieToSet[],
  responseHeaders: Record<string, string> = {},
) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  for (const [name, value] of Object.entries(responseHeaders)) {
    response.headers.set(name, value);
  }
  for (const cookie of cookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, sessionCookieOptions(cookie.options));
  }
  return response;
}
