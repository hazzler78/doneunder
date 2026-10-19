import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/mail/config";
import { exchangeGoogleCode, fetchGoogleProfileEmail } from "@/lib/mail/gmail";
import { upsertConnectedMailbox } from "@/lib/mail/mailbox-store";
import { parseOAuthState } from "@/lib/mail/oauth-state";
import { exchangeMicrosoftCode, fetchMicrosoftProfileEmail } from "@/lib/mail/outlook";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Provider = "gmail" | "outlook";

function redirectWithMessage(message: string) {
  const url = new URL("/workspace", getAppBaseUrl());
  url.searchParams.set("mail", message);
  return NextResponse.redirect(url);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await context.params;
  const provider = raw as Provider;
  if (provider !== "gmail" && provider !== "outlook") {
    return redirectWithMessage("unsupported_provider");
  }

  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    return redirectWithMessage(`oauth_denied:${oauthError}`);
  }
  if (!code || !state) {
    return redirectWithMessage("missing_oauth_params");
  }

  const parsed = parseOAuthState(state);
  if (!parsed || parsed.provider !== provider) {
    return redirectWithMessage("invalid_oauth_state");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== parsed.userId) {
    return redirectWithMessage("session_mismatch");
  }

  try {
    const service = createServiceSupabaseClient();

    if (provider === "gmail") {
      const tokens = await exchangeGoogleCode(code);
      const email = await fetchGoogleProfileEmail(tokens.accessToken);
      await upsertConnectedMailbox(service, {
        userId: user.id,
        provider: "gmail",
        email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      });
      return redirectWithMessage("gmail_connected");
    }

    const tokens = await exchangeMicrosoftCode(code);
    const email = await fetchMicrosoftProfileEmail(tokens.accessToken);
    await upsertConnectedMailbox(service, {
      userId: user.id,
      provider: "outlook",
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    });
    return redirectWithMessage("outlook_connected");
  } catch (error) {
    console.error("Mail OAuth callback failed:", error);
    return redirectWithMessage("oauth_failed");
  }
}
