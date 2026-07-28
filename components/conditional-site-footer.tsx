"use client";

import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";

const HIDE_FOOTER = ["/workspace", "/login", "/register", "/dashboard"];

export function ConditionalSiteFooter() {
  const pathname = usePathname();
  const hidden = HIDE_FOOTER.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (hidden) return null;
  return <SiteFooter />;
}
