import { divers } from "@/lib/mock-data";
import type { SearchCriteria, Teaser, TeaserRow } from "@/lib/company-search";

/** Locked fields shown as placeholders — never blur/tease real PII. */
export const LOCKED_PROFILE_FIELDS = [
  "Full name",
  "Location",
  "Tickets & medicals",
  "Dive / sat hours",
  "Contact & CV",
] as const;

export function initialsFromName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/**
 * Coarse industry bucket safe to show before payment.
 * Prefer explicit specialty; otherwise classify from headline / certs.
 */
export function industryFromSignals(input: {
  specialties?: string[] | null;
  headline?: string | null;
  certifications?: string[] | null;
}): string {
  const specialty = input.specialties?.find((s) => s.trim());
  if (specialty) return specialty.trim();

  const blob = [input.headline, ...(input.certifications ?? [])].filter(Boolean).join(" ").toLowerCase();
  if (!blob) return "Commercial diving";
  if (/\bwind\b|monopile|offshore wind/.test(blob)) return "Offshore wind";
  if (/\bndt\b|inspection|integrity|ultrasonic|mpi\b/.test(blob)) return "Inspection / NDT";
  if (/\bweld|hyperbaric|cswip|broco/.test(blob)) return "Welding / repair";
  if (/\bsat\b|saturation/.test(blob)) return "Saturation diving";
  if (/\binshore|harbour|port\b|construction/.test(blob)) return "Inshore construction";
  if (/\boffshore|irm|pipeline|oil|gas|north sea/.test(blob)) return "Offshore oil & gas";
  if (/\bdmt\b|medic/.test(blob)) return "Diver medic / support";
  return "Commercial diving";
}

function hoursBand(hours: number): string {
  if (hours <= 0) return "not declared";
  if (hours < 250) return "<250";
  if (hours < 500) return "250-500";
  if (hours < 1000) return "500-1000";
  if (hours < 2000) return "1000-2000";
  if (hours < 5000) return "2000-5000";
  return "5000+";
}

function matchesCriteria(
  diver: (typeof divers)[number],
  criteria: SearchCriteria,
): boolean {
  if (criteria.available_only && diver.availabilityStatus !== "available") return false;
  if (criteria.verified_only && !diver.verified) return false;
  if (criteria.min_dive_hours != null && diver.diveHours < criteria.min_dive_hours) return false;
  if (criteria.min_sat_hours != null && diver.satHours < criteria.min_sat_hours) return false;
  if (criteria.location) {
    const needle = criteria.location.toLowerCase();
    if (!diver.location.toLowerCase().includes(needle)) return false;
  }
  if (criteria.certs.length > 0) {
    const hay = diver.certifications.map((c) => c.toLowerCase()).join(" ");
    for (const cert of criteria.certs) {
      if (!hay.includes(cert.toLowerCase())) return false;
    }
  }
  if (criteria.welding.length > 0) {
    const hay = [...diver.certifications, ...diver.specialties].map((c) => c.toLowerCase()).join(" ");
    const any = criteria.welding.some((w) => hay.includes(w.toLowerCase()));
    if (!any) return false;
  }
  return true;
}

export type PreviewUnlockedProfile = {
  full_name: string;
  username: string;
  headline: string;
  location: string;
  availability_status: string;
  mobilization_notice: string;
  dive_hours: number;
  sat_hours: number;
  verified: boolean;
  certifications: Array<{ name: string; expiry_date: string | null }>;
};

export type PreviewMatch = {
  slot: number;
  teaser: Teaser;
  /** Present only after unlock — demo / reveal payload. */
  unlocked?: PreviewUnlockedProfile;
};

/** Deterministic demo search used when RPC preview is unavailable. */
export function previewMatchesFromMock(criteria: SearchCriteria): {
  searchId: string;
  matchCount: number;
  teasers: TeaserRow[];
  unlockedProfiles: PreviewUnlockedProfile[];
} {
  const matched = divers.filter((d) => matchesCriteria(d, criteria)).slice(0, 10);
  const searchId = `preview-${hashCriteria(criteria)}`;
  const teasers: TeaserRow[] = matched.map((diver, index) => ({
    slot: index + 1,
    teaser: {
      initials: initialsFromName(diver.fullName),
      industry: industryFromSignals({
        specialties: diver.specialties,
        headline: diver.headline,
        certifications: diver.certifications,
      }),
      certs_valid: diver.certifications.length,
      dive_hours_band: hoursBand(diver.diveHours),
      sat_hours_band: hoursBand(diver.satHours),
      available: diver.availabilityStatus === "available",
      verified: diver.verified,
      medical_valid: true,
      welding: diver.specialties.some((s) => /weld/i.test(s)) || diver.certifications.some((c) => /cswip|weld/i.test(c)),
    },
  }));
  const unlockedProfiles = matched.map((diver) => ({
    full_name: diver.fullName,
    username: diver.username,
    headline: diver.headline,
    location: diver.location,
    availability_status: diver.availabilityStatus,
    mobilization_notice: diver.mobilizationNotice,
    dive_hours: diver.diveHours,
    sat_hours: diver.satHours,
    verified: diver.verified,
    certifications: diver.certifications.map((name) => ({ name, expiry_date: null })),
  }));
  return { searchId, matchCount: matched.length, teasers, unlockedProfiles };
}

function hashCriteria(criteria: SearchCriteria): string {
  const raw = JSON.stringify(criteria);
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
