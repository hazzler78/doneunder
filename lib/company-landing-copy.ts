/**
 * Company registration landing — first-impression copy.
 * Tone: not a job-ad board; the company has the upper hand. No exclamation marks.
 * All user-facing strings are English.
 */

export type CompanyLandingVariant = "a" | "b";

export const COMPANY_LANDING_VARIANTS: Record<
  CompanyLandingVariant,
  { id: CompanyLandingVariant; headline: string; support: string; locale: "en" }
> = {
  a: {
    id: "a",
    locale: "en",
    headline: "we've already started looking",
    support: "register and see your matches",
  },
  /** Alternate calm framing for A/B — same posture, different lead. */
  b: {
    id: "b",
    locale: "en",
    headline: "the matches are already here",
    support: "register and see who matches",
  },
};

export const COMPANY_LANDING_DEFAULT_VARIANT: CompanyLandingVariant = "a";

export function resolveCompanyLandingVariant(
  raw: string | null | undefined,
): CompanyLandingVariant {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "b" || normalized === "variant_b") return "b";
  return "a";
}
