"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnalyticsEvent } from "@/lib/analytics-events";
import type { CompanyLandingVariant } from "@/lib/company-landing-copy";
import { trackAnalyticsEvent } from "@/lib/track-analytics";

export function CompanyLandingCta({
  variant,
  href,
  children,
}: {
  variant: CompanyLandingVariant;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => trackAnalyticsEvent(AnalyticsEvent.CompanyLandingCta, { variant })}
    >
      <Button size="lg" className="w-full sm:w-auto">
        {children}
      </Button>
    </Link>
  );
}
