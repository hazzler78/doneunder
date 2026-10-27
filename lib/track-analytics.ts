"use client";

import { track } from "@vercel/analytics";
import type { AnalyticsEventName, AnalyticsEventProps } from "@/lib/analytics-events";

export function trackAnalyticsEvent(name: AnalyticsEventName, properties?: AnalyticsEventProps) {
  try {
    track(name, properties);
  } catch {
    // Analytics must never break product flows.
  }
}
