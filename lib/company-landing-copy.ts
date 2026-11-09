/**
 * Company registration landing — first-impression copy.
 * Tone: not a job-ad board; the company has the upper hand. No exclamation marks.
 */

export type CompanyLandingVariant = "a" | "b";

export const COMPANY_LANDING_VARIANTS: Record<
  CompanyLandingVariant,
  { id: CompanyLandingVariant; headline: string; support: string; locale: "sv" }
> = {
  a: {
    id: "a",
    locale: "sv",
    headline: "vi har redan börjat leta",
    support: "registrera dig och se dina träffar",
  },
  /** Alternate calm framing for A/B — same posture, different lead. */
  b: {
    id: "b",
    locale: "sv",
    headline: "träffarna finns redan här",
    support: "registrera dig och se vilka som matchar",
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
