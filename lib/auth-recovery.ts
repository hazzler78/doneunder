import type { Session } from "@supabase/supabase-js";
import { safeInternalPath } from "@/lib/auth-paths";

/** Supabase appends `type=recovery` on some password-reset redirects. */
export function authTypeIndicatesRecovery(type: string | null | undefined): boolean {
  return type === "recovery";
}

/** Email confirmation / invite links also use OTP-style AMR; do not treat as password reset. */
export function authTypeIndicatesSignup(type: string | null | undefined): boolean {
  return type === "signup" || type === "invite" || type === "email_change";
}

export function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function authenticationMethods(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const amr = payload.amr;
  if (!Array.isArray(amr)) return [];
  return amr
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "method" in entry) {
        return String((entry as { method: unknown }).method);
      }
      return "";
    })
    .filter(Boolean);
}

/**
 * After PKCE code exchange, recovery sessions usually authenticate via email OTP,
 * not OAuth or password. Used when Supabase falls back to the Site URL and `next`
 * is lost (defaults to /workspace).
 */
export function accessTokenLooksLikePasswordRecovery(accessToken: string | null | undefined): boolean {
  if (!accessToken) return false;
  const methods = authenticationMethods(decodeJwtPayload(accessToken));
  if (methods.includes("oauth")) return false;
  if (methods.includes("password")) return false;
  return methods.some((m) => m === "otp" || m === "magiclink");
}

export function sessionLooksLikePasswordRecovery(session: Session | null): boolean {
  return accessTokenLooksLikePasswordRecovery(session?.access_token);
}

export type PostAuthDestinationInput = {
  nextRaw: string | null | undefined;
  typeRaw: string | null | undefined;
  accessToken: string | null | undefined;
  role: string;
  /** When set (e.g. /auth/recovery), always wins. */
  forcedNext?: string;
};

/** Where to send the browser after a successful auth code exchange. */
export function resolvePostAuthDestination(input: PostAuthDestinationInput): string {
  const { nextRaw, typeRaw, accessToken, role, forcedNext } = input;

  if (forcedNext) {
    return safeInternalPath(forcedNext, "/reset-password");
  }

  if (authTypeIndicatesRecovery(typeRaw)) {
    return "/reset-password";
  }

  if (safeInternalPath(nextRaw, "") === "/reset-password") {
    return "/reset-password";
  }

  const next = safeInternalPath(nextRaw);

  if (
    next === "/workspace" &&
    !authTypeIndicatesSignup(typeRaw) &&
    accessTokenLooksLikePasswordRecovery(accessToken)
  ) {
    return "/reset-password";
  }

  if (role === "admin") {
    return "/dashboard/admin";
  }

  return next;
}

/** Preserve recovery-related query params when forwarding a stray Site URL auth code. */
export function oauthForwardNextPath(
  pathname: string,
  searchParams: URLSearchParams,
): string {
  const type = searchParams.get("type");
  if (authTypeIndicatesRecovery(type) || pathname === "/auth/recovery") {
    return "/reset-password";
  }
  return safeInternalPath(searchParams.get("next"));
}

export function oauthForwardCallbackPath(
  pathname: string,
  searchParams: URLSearchParams,
): "/auth/callback" | "/auth/recovery" {
  const type = searchParams.get("type");
  if (authTypeIndicatesRecovery(type) || pathname === "/auth/recovery") {
    return "/auth/recovery";
  }
  return "/auth/callback";
}
