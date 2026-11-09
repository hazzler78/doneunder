"use client";

import { useEffect } from "react";
import { AnalyticsEvent } from "@/lib/analytics-events";
import type { CompanyLandingVariant } from "@/lib/company-landing-copy";
import { trackAnalyticsEvent } from "@/lib/track-analytics";

export function CompanyLandingViewTracker({ variant }: { variant: CompanyLandingVariant }) {
  useEffect(() => {
    trackAnalyticsEvent(AnalyticsEvent.CompanyLandingView, { variant });
  }, [variant]);
  return null;
}
