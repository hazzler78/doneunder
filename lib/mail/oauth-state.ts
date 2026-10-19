import { createHmac, timingSafeEqual } from "crypto";
import { getOAuthStateSecret } from "@/lib/mail/config";

type OAuthStatePayload = {
  userId: string;
  provider: "gmail" | "outlook";
  nonce: string;
  exp: number;
};

export function createOAuthState(userId: string, provider: "gmail" | "outlook") {
  const payload: OAuthStatePayload = {
    userId,
    provider,
    nonce: crypto.randomUUID(),
    exp: Date.now() + 1000 * 60 * 15,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function parseOAuthState(state: string): OAuthStatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload.userId || !payload.provider || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(body: string) {
  return createHmac("sha256", getOAuthStateSecret()).update(body).digest("base64url");
}
