import type { NextRequest } from "next/server";
import { handleAuthCallbackGet } from "@/lib/auth-callback";

export async function GET(request: NextRequest) {
  return handleAuthCallbackGet(request);
}
