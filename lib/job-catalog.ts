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
};

/**
 * Live campaigns Hermes can match. ClosesAt is the last day the listing is public.
 * Replace or extend via the jobs table; this catalog is the fallback.
 */
export const JOB_CATALOG: PublicJob[] = [
  {
    id: "job-nsea-irm-2026-09",
    title: "Air divers — North Sea IRM",
    description:
      "Inspection, repair and maintenance on producing North Sea assets. Surface-supplied air diving with possible sat-support. IMCA DSV / air spread. Mobilise from Aberdeen or Esbjerg.",
    location: "Northern North Sea",
    startDate: "2026-09-28",
    closesAt: "2026-09-14T17:00:00.000Z",
    requiredCerts: ["IMCA", "BOSIET", "OEUK Medical"],
    scope: "offshore",
    mobilization: "72 hours",
    status: "open",
  },
  {
    id: "job-wind-gbf-2026-10",
    title: "Inspection divers — offshore wind",
    description:
      "Monopile and transition-piece inspection package in the German Bight. NDT welcome. Air diving from a walk-to-work / CTV spread. English reporting.",
    location: "German Bight",
    startDate: "2026-10-06",
    closesAt: "2026-09-28T17:00:00.000Z",
    requiredCerts: ["IMCA", "BOSIET", "PCN NDT"],
    scope: "offshore",
    mobilization: "5 days",
    status: "open",
  },
  {
    id: "job-baltic-inshore-2026-10",
    title: "Inshore construction divers — Baltic harbour works",
    description:
      "Lock, quay and intake work in the Baltic. Air diving, Broco cutting, and construction support. EU work eligibility required.",
    location: "South Baltic",
    startDate: "2026-10-12",
    closesAt: "2026-10-05T17:00:00.000Z",
    requiredCerts: ["IMCA", "HSE Diver Medical"],
    scope: "inshore",
    mobilization: "7 days",
    status: "open",
  },
  {
    id: "job-ncs-sat-2026-09",
    title: "Saturation support — Norwegian Continental Shelf",
    description:
      "Sat-system support and air diving on NCS IRM / installation follow-on. DMT preferred. Valid OGUK/OEUK medical.",
    location: "Norwegian Sea / North Sea",
    startDate: "2026-09-22",
    closesAt: "2026-09-08T17:00:00.000Z",
    requiredCerts: ["IMCA", "BOSIET", "OEUK Medical"],
    scope: "offshore",
    mobilization: "48 hours",
    status: "open",
  },
  {
    id: "job-dsv-dmt-2026-10",
    title: "Diver Medic Technician — short-notice DSV",
    description:
      "DMT on a North Sea DSV for mixed IRM and construction. Must hold a current DMT ticket and be ready to sail on short notice.",
    location: "North Sea",
    startDate: "2026-10-01",
    closesAt: "2026-10-18T17:00:00.000Z",
    requiredCerts: ["IMCA", "DMT", "BOSIET"],
    scope: "offshore",
    mobilization: "24–48 hours",
    status: "open",
  },
];
