import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/feature-flags";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export function createSupabaseRouteClient(request: Request) {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split(";")
            .map((part) => {
              const [name, ...rest] = part.trim().split("=");
              return { name, value: rest.join("=") };
            })
            .filter((cookie) => cookie.name) ?? [];
        },
        setAll(next) {
          cookiesToSet.push(...next);
        },
      },
    },
  );

  return { supabase, cookiesToSet };
}

export function redirectWithCookies(url: string, cookiesToSet: CookieToSet[]) {
  const response = NextResponse.redirect(url);
  for (const cookie of cookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
