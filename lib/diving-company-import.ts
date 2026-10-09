import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDivingCompany,
  listDivingCompanies,
  type DivingCompany,
} from "@/lib/diving-companies";
import adcFullMembersSnapshot from "@/data/adc-full-members.json";

export type ImportedCompanyDraft = {
  name: string;
  website: string | null;
  country: string | null;
  location: string | null;
  memberType: string | null;
  hire_graduates: boolean;
  scopes: Array<"offshore" | "inshore">;
  notes: string;
  alreadyListed: boolean;
  existingSlug?: string;
};

export type ImportPreview = {
  sourceUrl: string;
  parser: "adc_members" | "adc_snapshot" | "generic_links";
  totalFound: number;
  drafts: ImportedCompanyDraft[];
  skippedEmpty: number;
  fetchNote?: string;
};

const ADC_HOME = "https://www.adc-uk.info";
const ADC_MEMBERS = "https://www.adc-uk.info/find-a-member/";

const UK_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function attr(block: string, name: string) {
  const match = block.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeHtmlEntities(match[1] ?? "") : "";
}

function normalizeWebsite(raw: string | null | undefined) {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/\//, "")}`;
}

function countryFromAddress(address: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "UK";
  const joined = address.toLowerCase();
  if (joined.includes("northern ireland") || joined.includes("scotland") || joined.includes("england") || joined.includes("wales")) {
    return "UK";
  }
  if (/\b(eire|republic of ireland)\b/i.test(address) || /,\s*ireland\s*$/i.test(address.trim())) {
    return "Ireland";
  }
  const last = parts[parts.length - 1]!.toLowerCase();
  if (last === "uk" || last === "united kingdom" || last === "gb") return "UK";
  if (last === "ireland" || last === "eire" || last === "roi") return "Ireland";
  if (UK_POSTCODE_RE.test(last) || UK_POSTCODE_RE.test(address)) return "UK";
  if (last.length >= 2 && last.length <= 24 && !/\d/.test(last)) {
    return parts[parts.length - 1]!;
  }
  return "UK";
}

function locationFromAddress(address: string) {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  // Skip leading contact person; prefer town/region tokens
  const candidates = parts.slice(1, -1).filter((part) => !/^\d/.test(part) && part.length > 1);
  if (candidates.length === 0) return parts[1] ?? null;
  return candidates.slice(0, 2).join(", ");
}

function parseMemberType(nameType: string) {
  const trimmed = nameType.trim();
  if (!trimmed) return { name: "", memberType: null as string | null };
  const split = trimmed.match(/^(.*?)\s+-\s+(Full Member|Associate Member|Corresponding Member|Overseas Corresponding Member)\s*$/i);
  if (split) {
    return { name: split[1]!.trim(), memberType: split[2]!.trim() };
  }
  return { name: trimmed, memberType: null as string | null };
}

/** Parse ADC Find A Member HTML (`singleMemberInit` cards). */
export function parseAdcMembersHtml(html: string): Omit<ImportedCompanyDraft, "alreadyListed" | "existingSlug">[] {
  const re = /<div class="singleMemberInit"([^>]*)>/gi;
  const seen = new Set<string>();
  const out: Omit<ImportedCompanyDraft, "alreadyListed" | "existingSlug">[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const block = match[1] ?? "";
    const nameType = attr(block, "data-name-type");
    const website = normalizeWebsite(attr(block, "data-website"));
    const address = attr(block, "data-address");
    if (!nameType) continue;
    const { name, memberType } = parseMemberType(nameType);
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const isFull = (memberType || "").toLowerCase() === "full member";
    out.push({
      name,
      website,
      country: countryFromAddress(address) || "UK",
      location: locationFromAddress(address),
      memberType,
      hire_graduates: isFull,
      scopes: ["inshore"],
      notes: [
        memberType ? `ADC ${memberType}.` : "ADC member.",
        "Source: adc-uk.info Find a Member (discovery only — no CV blast).",
        "apply_email empty until a careers inbox is verified.",
      ].join(" "),
    });
  }
  return out;
}

/** Lightweight fallback: unique external http(s) links with company-like anchor text. */
export function parseGenericCompanyLinksHtml(
  html: string,
  pageUrl: string,
): Omit<ImportedCompanyDraft, "alreadyListed" | "existingSlug">[] {
  const host = (() => {
    try {
      return new URL(pageUrl).host.toLowerCase();
    } catch {
      return "";
    }
  })();
  const re = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const out: Omit<ImportedCompanyDraft, "alreadyListed" | "existingSlug">[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = normalizeWebsite(match[1]);
    const text = decodeHtmlEntities((match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (!href || !text || text.length < 3 || text.length > 80) continue;
    try {
      const linkHost = new URL(href).host.toLowerCase();
      if (host && (linkHost === host || linkHost.endsWith(`.${host}`))) continue;
      if (/facebook|linkedin|twitter|instagram|youtube|google|apple\.com/i.test(linkHost)) continue;
    } catch {
      continue;
    }
    if (!/(ltd|limited|llc|inc|marine|diving|dive|subsea|offshore|contract)/i.test(text) &&
      !/(ltd|limited|llc|inc|marine|diving|dive|subsea)/i.test(href)) {
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: text,
      website: href,
      country: null,
      location: null,
      memberType: null,
      hire_graduates: false,
      scopes: ["inshore", "offshore"],
      notes: `Imported from ${pageUrl}. apply_email empty until verified.`,
    });
  }
  return out;
}

export function resolveImportUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }
  const host = url.host.toLowerCase().replace(/^www\./, "");
  if (host === "adc-uk.info") {
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "" || path === "/home") {
      return ADC_MEMBERS;
    }
  }
  return url.toString();
}

function isAdcHost(url: string) {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "") === "adc-uk.info";
  } catch {
    return false;
  }
}

function draftsFromAdcSnapshot(
  options?: { fullMembersOnly?: boolean },
): Omit<ImportedCompanyDraft, "alreadyListed" | "existingSlug">[] {
  const fullOnly = options?.fullMembersOnly !== false;
  const members = Array.isArray(adcFullMembersSnapshot.members) ? adcFullMembersSnapshot.members : [];
  return members
    .filter((row) => {
      if (!row?.name) return false;
      if (!fullOnly) return true;
      return String(row.memberType || "Full Member").toLowerCase() === "full member";
    })
    .map((row) => ({
      name: String(row.name).trim(),
      website: normalizeWebsite(row.website),
      country: row.country ? String(row.country) : "UK",
      location: row.location ? String(row.location) : null,
      memberType: row.memberType ? String(row.memberType) : "Full Member",
      hire_graduates: true,
      scopes: ["inshore"] as Array<"offshore" | "inshore">,
      notes: [
        "ADC Full Member.",
        `Source snapshot ${adcFullMembersSnapshot.fetchedAt || "bundled"} from adc-uk.info Find a Member (discovery only — no CV blast).`,
        "apply_email empty until a careers inbox is verified.",
      ].join(" "),
    }));
}

export async function fetchCompanyDirectoryHtml(url: string) {
  const resolved = resolveImportUrl(url);
  const response = await fetch(resolved, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; DoneUnder-Hermes/1.1; +https://doneunder.ai) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`Could not fetch directory (${response.status}).`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!/html|text|xml/i.test(contentType) && contentType) {
    throw new Error("URL did not return an HTML page.");
  }
  const html = await response.text();
  if (html.length > 2_500_000) {
    throw new Error("Page is too large to import.");
  }
  return { url: resolved, html };
}

export function extractCompanyDraftsFromHtml(
  html: string,
  pageUrl: string,
  options?: { fullMembersOnly?: boolean },
): { parser: ImportPreview["parser"]; drafts: Omit<ImportedCompanyDraft, "alreadyListed" | "existingSlug">[] } {
  const adc = parseAdcMembersHtml(html);
  if (adc.length > 0) {
    const fullOnly = options?.fullMembersOnly !== false;
    const filtered = fullOnly
      ? adc.filter((item) => (item.memberType || "").toLowerCase() === "full member")
      : adc;
    return { parser: "adc_members", drafts: filtered };
  }
  return { parser: "generic_links", drafts: parseGenericCompanyLinksHtml(html, pageUrl) };
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function previewDivingCompaniesFromUrl(
  supabase: SupabaseClient,
  rawUrl: string,
  options?: { fullMembersOnly?: boolean; limit?: number },
): Promise<ImportPreview> {
  const resolved = resolveImportUrl(rawUrl);
  let parser: ImportPreview["parser"] = "generic_links";
  let drafts: Omit<ImportedCompanyDraft, "alreadyListed" | "existingSlug">[] = [];
  let fetchNote: string | undefined;

  try {
    const { url, html } = await fetchCompanyDirectoryHtml(resolved);
    const extracted = extractCompanyDraftsFromHtml(html, url, {
      fullMembersOnly: options?.fullMembersOnly,
    });
    parser = extracted.parser;
    drafts = extracted.drafts;
    if (drafts.length === 0 && isAdcHost(url)) {
      drafts = draftsFromAdcSnapshot(options);
      parser = "adc_snapshot";
      fetchNote = "Live ADC page returned no member cards; used bundled Full Member snapshot.";
    }
  } catch (error) {
    if (!isAdcHost(resolved)) throw error;
    drafts = draftsFromAdcSnapshot(options);
    parser = "adc_snapshot";
    fetchNote = `Live ADC fetch failed (${error instanceof Error ? error.message : String(error)}); used bundled Full Member snapshot.`;
  }

  const existing = await listDivingCompanies(supabase, { status: "all", limit: 500 });
  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const byName = new Map(existing.map((row) => [row.name.trim().toLowerCase(), row]));

  const limit = options?.limit ?? 120;
  const enriched: ImportedCompanyDraft[] = drafts.slice(0, limit).map((draft) => {
    const slug = slugify(draft.name);
    const hit = bySlug.get(slug) || byName.get(draft.name.toLowerCase());
    return {
      ...draft,
      alreadyListed: Boolean(hit),
      existingSlug: hit?.slug,
    };
  });

  return {
    sourceUrl: resolved,
    parser,
    totalFound: drafts.length,
    drafts: enriched,
    skippedEmpty: 0,
    fetchNote,
  };
}

export async function importDivingCompaniesFromUrl(
  supabase: SupabaseClient,
  rawUrl: string,
  options?: { fullMembersOnly?: boolean; confirmed?: boolean; limit?: number },
) {
  const preview = await previewDivingCompaniesFromUrl(supabase, rawUrl, {
    fullMembersOnly: options?.fullMembersOnly,
    limit: options?.limit,
  });

  if (!options?.confirmed) {
    return {
      ok: false as const,
      needs_confirmation: true as const,
      message:
        "Preview only. Show the count and a short sample to Gareth and ask to confirm before importing. Then call again with confirmed=true. Do not invent emails.",
      preview: {
        sourceUrl: preview.sourceUrl,
        parser: preview.parser,
        fetchNote: preview.fetchNote,
        totalFound: preview.totalFound,
        newCount: preview.drafts.filter((d) => !d.alreadyListed).length,
        alreadyListedCount: preview.drafts.filter((d) => d.alreadyListed).length,
        sample: preview.drafts.slice(0, 25).map((d) => ({
          name: d.name,
          website: d.website,
          country: d.country,
          memberType: d.memberType,
          alreadyListed: d.alreadyListed,
        })),
      },
    };
  }

  const toAdd = preview.drafts.filter((d) => !d.alreadyListed);
  const added: Array<Pick<DivingCompany, "slug" | "name" | "website">> = [];
  const errors: string[] = [];

  for (const draft of toAdd) {
    try {
      const result = await addDivingCompany(supabase, {
        name: draft.name,
        website: draft.website,
        country: draft.country,
        location: draft.location,
        scopes: draft.scopes,
        typical_certs: ["IMCA", "HSE Diver Medical"],
        notes: draft.notes,
        hire_graduates: draft.hire_graduates,
        apply_email: null,
      });
      if (!result.ok) {
        errors.push(`${draft.name}: ${result.error}`);
        continue;
      }
      added.push({
        slug: result.company.slug,
        name: result.company.name,
        website: result.company.website,
      });
    } catch (error) {
      errors.push(`${draft.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    ok: true as const,
    sourceUrl: preview.sourceUrl,
    parser: preview.parser,
    totalFound: preview.totalFound,
    addedCount: added.length,
    skippedExisting: preview.drafts.filter((d) => d.alreadyListed).length,
    added: added.slice(0, 40),
    errors: errors.slice(0, 20),
    note: "apply_email left empty on all imports. Set verified careers inboxes with update_diving_company before divers can apply.",
  };
}

export const ADC_MEMBERS_URL = ADC_MEMBERS;
export const ADC_HOME_URL = ADC_HOME;
