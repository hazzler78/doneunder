/** Only allow same-origin relative paths after OAuth. */
export function safeInternalPath(next: string | null | undefined, fallback = "/workspace") {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    return next;
  }
  return fallback;
}

/**
 * Supabase Site URL is https://doneunder.ai. If that URL is used as the OAuth
 * return (instead of /auth/callback), the auth code lands on the homepage and
 * the session is never exchanged. Forward it.
 */
export function oauthForwardPath(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname === "/auth/callback" || pathname === "/auth/google") return null;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  if (!code && !error) return null;

  const next = new URLSearchParams();
  if (code) next.set("code", code);
  if (error) next.set("error", error);
  const description = searchParams.get("error_description");
  if (description) next.set("error_description", description);
  next.set("next", safeInternalPath(searchParams.get("next")));
  return `/auth/callback?${next.toString()}`;
}
