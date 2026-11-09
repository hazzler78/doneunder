import { generateObject } from "ai";
import { z } from "zod";
import { aiModel, ENGLISH_ONLY_INSTRUCTION } from "@/lib/ai";
import { isAiConfigured } from "@/lib/feature-flags";
import {
  previewMatchesFromMock,
  type PreviewUnlockedProfile,
} from "@/lib/company-preview";
import {
  searchCriteriaSchema,
  type SearchCriteria,
  type SearchResult,
  type TeaserRow,
} from "@/lib/company-search";

const CERT_ALIASES: Array<{ needle: RegExp; value: string }> = [
  { needle: /\bimca\b/i, value: "IMCA" },
  { needle: /\badci\b/i, value: "ADCI" },
  { needle: /\bhse\b/i, value: "HSE" },
  { needle: /\bndt\b|\bpcn\b/i, value: "PCN NDT" },
  { needle: /\bcswip\b|\bweld/i, value: "CSWIP 3.1U" },
  { needle: /\bbosiet\b/i, value: "BOSIET" },
  { needle: /\boguk\b|\boeuk\b/i, value: "OGUK Medical" },
  { needle: /\bdmt\b|diver medic/i, value: "Diver Medic Technician" },
  { needle: /surface supplied/i, value: "HSE Surface Supplied" },
  { needle: /\bsat(?:uration)?\b/i, value: "IMCA Sat" },
];

const criteriaAiSchema = z.object({
  certs: z.array(z.string()).max(10).default([]),
  welding: z.array(z.string()).max(10).default([]),
  location: z.string().max(80).nullable().optional(),
  min_dive_hours: z.number().int().min(0).max(100000).nullable().optional(),
  min_sat_hours: z.number().int().min(0).max(100000).nullable().optional(),
  available_only: z.boolean().default(true),
  verified_only: z.boolean().default(false),
  summary: z.string().max(280),
});

export type HermesCompanySearchOutcome = {
  summary: string;
  criteria: SearchCriteria;
  result: SearchResult;
  profiles: PreviewUnlockedProfile[];
  source: "ai" | "heuristic";
};

/** Deterministic NL → criteria for demos and when XAI is offline. */
export function heuristicCriteriaFromBrief(brief: string): {
  criteria: SearchCriteria;
  summary: string;
} {
  const text = brief.trim();
  const lower = text.toLowerCase();
  const certs: string[] = [];
  for (const alias of CERT_ALIASES) {
    if (alias.needle.test(text) && !certs.includes(alias.value)) certs.push(alias.value);
  }

  const welding: string[] = [];
  if (/\bweld|cswip|hyperbaric weld/i.test(text)) welding.push("CSWIP 3.1U");

  let location: string | undefined;
  const locMatch =
    text.match(/\b(?:in|near|around|based in)\s+([A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö\s-]{1,40})/i) ||
    text.match(/\b(North Sea|Baltic|Aberdeen|Bergen|Stavanger|Rotterdam|Malm[oö]|Gothenburg|Esbjerg)\b/i);
  if (locMatch?.[1]) location = locMatch[1].trim().replace(/[.,;]+$/, "");

  let min_dive_hours: number | undefined;
  let min_sat_hours: number | undefined;
  const diveHours = text.match(/(\d{3,5})\s*(?:\+?\s*)?(?:dive|diving)\s*hours?/i);
  const satHours = text.match(/(\d{3,5})\s*(?:\+?\s*)?(?:sat(?:uration)?)\s*hours?/i);
  if (diveHours) min_dive_hours = Number.parseInt(diveHours[1], 10);
  if (satHours) min_sat_hours = Number.parseInt(satHours[1], 10);
  if (!satHours && /\bsat\b/i.test(text) && /(\d{3,5})\s*\+?\s*hrs?/i.test(text)) {
    const any = text.match(/(\d{3,5})\s*\+?\s*hrs?/i);
    if (any) min_sat_hours = Number.parseInt(any[1], 10);
  }

  const available_only = !/\b(?:deployed|not available|unavailable)\b/i.test(lower);
  const verified_only = /\bverified\b/i.test(lower);

  const criteria = searchCriteriaSchema.parse({
    certs: certs.slice(0, 10),
    welding: welding.slice(0, 10),
    location,
    min_dive_hours,
    min_sat_hours,
    available_only,
    verified_only,
  });

  const bits = [
    criteria.certs.length ? `tickets: ${criteria.certs.join(", ")}` : null,
    criteria.location ? `location ~ ${criteria.location}` : null,
    criteria.min_dive_hours != null ? `min dive ${criteria.min_dive_hours}h` : null,
    criteria.min_sat_hours != null ? `min sat ${criteria.min_sat_hours}h` : null,
    criteria.welding.length ? "welding" : null,
    criteria.available_only ? "available now" : null,
    criteria.verified_only ? "verified only" : null,
  ].filter(Boolean);

  return {
    criteria,
    summary: bits.length
      ? `Hermes read your brief as ${bits.join(" · ")}.`
      : "Hermes could not extract hard filters — showing available commercial divers. Narrow with tickets, location, or hours.",
  };
}

async function aiCriteriaFromBrief(brief: string): Promise<{
  criteria: SearchCriteria;
  summary: string;
} | null> {
  if (!isAiConfigured()) return null;
  try {
    const { object } = await generateObject({
      model: aiModel,
      schema: criteriaAiSchema,
      prompt: `${ENGLISH_ONLY_INSTRUCTION}

You convert a commercial diving hiring desk brief into Search & Match filters for doneunder.ai.
Only set fields clearly implied by the brief. Prefer fewer filters over inventing requirements.
Cert names should be short ticket labels (IMCA, HSE, PCN NDT, CSWIP 3.1U, BOSIET, etc.).
Brief:
"""
${brief.slice(0, 4000)}
"""`,
    });

    const criteria = searchCriteriaSchema.parse({
      certs: object.certs,
      welding: object.welding,
      location: object.location || undefined,
      min_dive_hours: object.min_dive_hours ?? undefined,
      min_sat_hours: object.min_sat_hours ?? undefined,
      available_only: object.available_only,
      verified_only: object.verified_only,
    });
    return { criteria, summary: object.summary };
  } catch (error) {
    console.error("Hermes company criteria AI failed:", error);
    return null;
  }
}

export async function interpretCompanyHiringBrief(brief: string): Promise<{
  criteria: SearchCriteria;
  summary: string;
  source: "ai" | "heuristic";
}> {
  const trimmed = brief.trim();
  if (!trimmed) {
    return {
      criteria: searchCriteriaSchema.parse({ available_only: true }),
      summary: "Add a short hiring brief so Hermes can filter candidates.",
      source: "heuristic",
    };
  }
  const ai = await aiCriteriaFromBrief(trimmed);
  if (ai) return { ...ai, source: "ai" };
  const heuristic = heuristicCriteriaFromBrief(trimmed);
  return { ...heuristic, source: "heuristic" };
}

/** Run Hermes interpretation + locked preview matches (initials/industry only until unlock). */
export async function hermesCompanyPreviewSearch(brief: string): Promise<HermesCompanySearchOutcome> {
  const interpreted = await interpretCompanyHiringBrief(brief);
  const preview = previewMatchesFromMock(interpreted.criteria);
  const teasers: TeaserRow[] = preview.teasers;
  return {
    summary: interpreted.summary,
    criteria: interpreted.criteria,
    source: interpreted.source,
    profiles: preview.unlockedProfiles,
    result: {
      searchId: preview.searchId,
      matchCount: preview.matchCount,
      teasers,
      unlocked: false,
      source: "preview",
    },
  };
}
