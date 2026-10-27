import "server-only";

import { track } from "@vercel/analytics/server";
import type { AnalyticsEventName, AnalyticsEventProps } from "@/lib/analytics-events";

export async function trackAnalyticsEventServer(
  name: AnalyticsEventName,
  properties?: AnalyticsEventProps,
) {
  try {
    await track(name, properties);
  } catch {
    // Analytics must never break product flows.
  }
}
