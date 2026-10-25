import type { NextRequest } from "next/server";
import { handleAuthCallbackGet } from "@/lib/auth-callback";

/** Password-reset emails should redirect here (dedicated allow-list entry). */
export async function GET(request: NextRequest) {
  return handleAuthCallbackGet(request, { forcedNext: "/reset-password" });
}
