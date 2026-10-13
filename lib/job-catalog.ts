export type JobScope = "offshore" | "inshore";

export type PublicJob = {
  id: string;
  title: string;
  description: string;
  location: string;
  startDate: string | null;
  closesAt: string | null;
  requiredCerts: string[];
  scope: JobScope;
  mobilization: string;
  status: "open" | "filled" | "draft";
  /**
   * Verified contractor careers inbox. Required for a campaign to appear on the board
   * or accept apply_job. Never invent — only emails from the company’s own careers page.
   */
  applyEmail?: string | null;
  /**
   * When the campaign became alertable. Jobs without this never trigger email/Hermes
   * job alerts (keeps the pre-existing catalog from blasting everyone on ship day).
   * DB rows use `created_at`.
   */
  postedAt?: string | null;
};

/**
 * Live campaigns Hermes can match. Only rows with a verified applyEmail are shown.
 * ClosesAt is the last day the listing is public.
 * Replace or extend via the jobs table; this catalog is the fallback.
 */
export const JOB_CATALOG: PublicJob[] = [
  {
    id: "job-baltic-taucher-2026-11",
    title: "Berufstaucher — Baltic Taucher (Rostock / North & Baltic Sea)",
    description:
      "Full-time commercial diver with Baltic Taucherei Rostock. Harbour, offshore, salvage and construction scopes across the North and Baltic Sea. Apply with CV + tickets to their careers desk.",
    location: "Rostock, Germany — North Sea & Baltic projects",
    startDate: null,
    closesAt: "2026-12-15T17:00:00.000Z",
    requiredCerts: ["IMCA", "HSE Diver Medical"],
    scope: "inshore",
    mobilization: "Agree start date with company",
    status: "open",
    applyEmail: "bewerbung@baltic-taucher.de",
    postedAt: "2026-10-13T12:00:00.000Z",
  },
  {
    id: "job-nordseetaucher-2026-11",
    title: "Berufstaucher — NORDSEETAUCHER (Bremerhaven / ports & inland)",
    description:
      "Experienced professional diver for NORDSEETAUCHER in Bremerhaven. Ports, power plants, dams, rivers and lakes — inspections, welding/cutting, repair and equipment care. Permanent full-time role.",
    location: "Bremerhaven, Germany — ports & inland waters",
    startDate: null,
    closesAt: "2026-12-15T17:00:00.000Z",
    requiredCerts: ["IMCA", "HSE Diver Medical"],
    scope: "inshore",
    mobilization: "Agree start date with company",
    status: "open",
    applyEmail: "info@nordseetaucher.de",
    postedAt: "2026-10-13T12:00:00.000Z",
  },
];
