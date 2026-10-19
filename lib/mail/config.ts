import { SITE_URL } from "@/lib/site";

function clean(value: string | undefined) {
  return (value ?? "").replace(/^["']|["']$/g, "").trim();
}

export function getAppBaseUrl() {
  return clean(process.env.NEXT_PUBLIC_APP_URL) || SITE_URL || "http://localhost:3000";
}

export function isGmailOAuthConfigured() {
  return Boolean(clean(process.env.GOOGLE_CLIENT_ID) && clean(process.env.GOOGLE_CLIENT_SECRET));
}

export function isOutlookOAuthConfigured() {
  return Boolean(
    clean(process.env.MICROSOFT_CLIENT_ID) && clean(process.env.MICROSOFT_CLIENT_SECRET),
  );
}

export function getGoogleOAuthConfig() {
  const clientId = clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${getAppBaseUrl()}/api/mail/callback/gmail`,
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  };
}

export function getMicrosoftOAuthConfig() {
  const clientId = clean(process.env.MICROSOFT_CLIENT_ID);
  const clientSecret = clean(process.env.MICROSOFT_CLIENT_SECRET);
  const tenant = clean(process.env.MICROSOFT_TENANT_ID) || "common";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Microsoft OAuth is not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).",
    );
  }
  return {
    clientId,
    clientSecret,
    tenant,
    redirectUri: `${getAppBaseUrl()}/api/mail/callback/outlook`,
    scopes: ["openid", "email", "profile", "offline_access", "User.Read", "Mail.Send", "Mail.Read"],
  };
}

export function getOAuthStateSecret() {
  return (
    clean(process.env.MAIL_OAUTH_STATE_SECRET) ||
    clean(process.env.HERMES_AGENT_SECRET) ||
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    "dev-mail-oauth-secret"
  );
}
