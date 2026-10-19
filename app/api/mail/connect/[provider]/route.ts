import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/mail/oauth-state";
import { isGmailOAuthConfigured, isOutlookOAuthConfigured } from "@/lib/mail/config";
import { buildGoogleAuthUrl } from "@/lib/mail/gmail";
import { buildMicrosoftAuthUrl } from "@/lib/mail/outlook";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Provider = "gmail" | "outlook";

export async function GET(
  _req: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await context.params;
  const provider = raw as Provider;
  if (provider !== "gmail" && provider !== "outlook") {
    return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
  }

  if (provider === "gmail" && !isGmailOAuthConfigured()) {
    return NextResponse.json(
      { error: "Gmail connect is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." },
      { status: 503 },
    );
  }
  if (provider === "outlook" && !isOutlookOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Outlook connect is not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).",
      },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?message=Sign%20in%20to%20connect%20email", _req.url));
  }

  const state = createOAuthState(user.id, provider);
  const authUrl = provider === "gmail" ? buildGoogleAuthUrl(state) : buildMicrosoftAuthUrl(state);
  return NextResponse.redirect(authUrl);
}
