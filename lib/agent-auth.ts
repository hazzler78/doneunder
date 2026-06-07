import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isHermesAgentConfigured } from "@/lib/env";

export type AgentAuthResult = { ok: true } | { ok: false; response: NextResponse };

function safeCompare(expected: string, provided: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

/** Validates Hermes agent bearer token from Authorization header. */
export function verifyHermesAgent(req: Request): AgentAuthResult {
  if (!isHermesAgentConfigured()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Hermes agent API is not configured." }, { status: 503 }),
    };
  }

  const token = getBearerToken(req);
  const secret = process.env.HERMES_AGENT_SECRET!;
  if (!token || !safeCompare(secret, token)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized agent request." }, { status: 401 }),
    };
  }

  return { ok: true };
}

export function getAgentSourceRef(req: Request) {
  return req.headers.get("x-hermes-source-ref")?.trim() || null;
}
