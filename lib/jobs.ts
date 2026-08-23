import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_CATALOG, type PublicJob } from "@/lib/job-catalog";
import { CONTACT_EMAIL } from "@/lib/site";

/** Product policy for match/apply: docs/hiring-and-apply.md */

export type { PublicJob } from "@/lib/job-catalog";

export function isJobOpen(job: Pick<PublicJob, "status" | "closesAt">, now = new Date()) {
  if (job.status && job.status !== "open") return false;
  if (!job.closesAt) return true;
  return new Date(job.closesAt).getTime() > now.getTime();
}

export function listCatalogJobs(now = new Date()) {
  return JOB_CATALOG.filter((job) => isJobOpen(job, now)).sort(byCloseThenStart);
}

function byCloseThenStart(a: PublicJob, b: PublicJob) {
  const closeA = a.closesAt ? new Date(a.closesAt).getTime() : Number.MAX_SAFE_INTEGER;
  const closeB = b.closesAt ? new Date(b.closesAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (closeA !== closeB) return closeA - closeB;
  return (a.startDate ?? "").localeCompare(b.startDate ?? "");
}

export function daysUntilClose(closesAt: string | null, now = new Date()) {
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function findCatalogJob(id: string) {
  return JOB_CATALOG.find((job) => job.id === id) ?? null;
}

export function workspaceMatchHref(jobId: string) {
  return `/workspace?job=${encodeURIComponent(jobId)}`;
}

export function matchPromptForJob(job: PublicJob) {
  return [
    `Match me to this campaign (job id ${job.id}).`,
    `Title: ${job.title}`,
    `Location: ${job.location}`,
    `Scope: ${job.scope}`,
    job.startDate ? `Starts: ${job.startDate}` : null,
    job.closesAt ? `Apply by: ${job.closesAt}` : null,
    job.mobilization ? `Mobilisation: ${job.mobilization}` : null,
    `Required tickets: ${job.requiredCerts.join(", ") || "not listed"}`,
    `Description: ${job.description}`,
    `You MUST call match_job with job_id="${job.id}". Tell me the fit (strong / possible / weak), which required tickets are current, which are expired, which are missing, and the next step. Do not invent tickets I do not have. An expired required ticket is not current.`,
    `If required tickets are expired or missing, do not offer apply. If they want to apply and canApply is true, wait for a clear yes, then call apply_job with this job_id. Do not invent a company email.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type DiverTicket = {
  name: string;
  expiryDate?: string | null;
};

export type JobMatch = {
  have: string[];
  missing: string[];
  expired: string[];
  unknownExpiry: string[];
  locationFit: boolean;
  score: number;
  verdict: "strong" | "possible" | "weak";
  open: boolean;
  canApply: boolean;
};

function calendarDay(value: Date | string) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** True when the expiry calendar day is before today. Same-day expiry is still current. */
export function isTicketExpired(expiryDate: string | null | undefined, now = new Date()) {
  if (!expiryDate?.trim()) return false;
  const exp = calendarDay(expiryDate);
  const today = calendarDay(now);
  if (!exp || !today) return false;
  return exp < today;
}

function namesMatch(required: string, ticketName: string) {
  const needle = required.toLowerCase();
  const name = ticketName.toLowerCase();
  if (name.includes(needle) || needle.includes(name)) return true;
  const tokens = needle.split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  return tokens.length > 0 && tokens.every((token) => name.includes(token));
}

export function scoreDiverAgainstJob(
  job: PublicJob,
  input: {
    certs?: DiverTicket[];
    certNames?: string[];
    location?: string | null;
  },
  now = new Date(),
): JobMatch {
  const tickets: DiverTicket[] =
    input.certs ?? (input.certNames ?? []).map((name) => ({ name, expiryDate: null }));

  const required = job.requiredCerts;
  const have: string[] = [];
  const missing: string[] = [];
  const expired: string[] = [];
  const unknownExpiry: string[] = [];

  for (const cert of required) {
    const hit = tickets.find((ticket) => namesMatch(cert, ticket.name));
    if (!hit) {
      missing.push(cert);
      continue;
    }
    if (isTicketExpired(hit.expiryDate, now)) {
      expired.push(cert);
      continue;
    }
    have.push(cert);
    if (!hit.expiryDate?.trim()) unknownExpiry.push(cert);
  }

  const loc = (input.location ?? "").toLowerCase();
  const jobLoc = job.location.toLowerCase();
  const locationFit = Boolean(loc && jobLoc && (loc.includes(jobLoc) || jobLoc.includes(loc)));
  const complete = required.length > 0 && missing.length === 0 && expired.length === 0;
  const score = Math.max(
    0,
    Math.min(100, have.length * 28 + (complete ? 16 : 0) + (locationFit ? 10 : 0) - expired.length * 12),
  );
  const verdict: "strong" | "possible" | "weak" = complete
    ? "strong"
    : have.length > 0
      ? "possible"
      : "weak";
  const open = isJobOpen(job, now);
  return {
    have,
    missing,
    expired,
    unknownExpiry,
    locationFit,
    score,
    verdict,
    open,
    canApply: open && expired.length === 0 && missing.length === 0,
  };
}

export function formatMatchReason(match: JobMatch) {
  const parts: string[] = [];
  if (match.have.length) parts.push(`Current: ${match.have.join(", ")}`);
  if (match.expired.length) parts.push(`Expired: ${match.expired.join(", ")}`);
  if (match.missing.length) parts.push(`Missing: ${match.missing.join(", ")}`);
  if (match.unknownExpiry.length) parts.push(`No expiry on file: ${match.unknownExpiry.join(", ")}`);
  if (!parts.length) parts.push("No required tickets listed");
  if (!match.canApply) {
    if (match.expired.length) parts.push("Do not apply until expired tickets are renewed");
    else if (match.missing.length) parts.push("Do not apply until missing tickets are on file");
  }
  return `${parts.join(". ")}.`;
}

export function applyBlockReason(match: JobMatch) {
  if (!match.open) return "This campaign has closed.";
  if (match.expired.length) {
    return `Not sent. Required tickets expired: ${match.expired.join(", ")}. Renew those first.`;
  }
  if (match.missing.length) {
    return `Not sent. Required tickets missing: ${match.missing.join(", ")}. Add current scans first.`;
  }
  return null;
}

export function applyAddressForJob(job: Pick<PublicJob, "applyEmail">) {
  const custom = job.applyEmail?.trim().toLowerCase();
  if (custom && custom.includes("@")) return custom;
  return CONTACT_EMAIL;
}

export function applicationDraft(job: PublicJob, displayName: string) {
  const to = applyAddressForJob(job);
  const subject = `Application: ${job.title} — ${displayName}`;
  const body = [
    "Hello,",
    "",
    `Please consider my application for ${job.title} (${job.location}).`,
    job.mobilization ? `I can mobilise ${job.mobilization}.` : null,
    "",
    "CV and certificates are attached.",
    "",
    "Kind regards,",
    displayName,
  ]
    .filter((line) => line !== null)
    .join("\n");
  return { to, subject, body, attachCv: true as const, attachCertificates: true as const };
}

type JobRow = {
  id: string;
  title: string;
  description: string;
  location: string | null;
  start_date: string | null;
  required_certs: string[] | null;
  status: string | null;
  closes_at?: string | null;
  scope?: string | null;
  mobilization?: string | null;
};

function rowToPublicJob(row: JobRow): PublicJob {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location ?? "",
    startDate: row.start_date,
    closesAt: row.closes_at ?? null,
    requiredCerts: row.required_certs ?? [],
    scope: row.scope === "inshore" ? "inshore" : "offshore",
    mobilization: row.mobilization ?? "",
    status: row.status === "filled" || row.status === "draft" ? row.status : "open",
    applyEmail: null,
  };
}

export async function loadOpenJobs(supabase?: SupabaseClient | null, now = new Date()): Promise<PublicJob[]> {
  if (supabase) {
    try {
      const full = await supabase
        .from("jobs")
        .select("id,title,description,location,start_date,required_certs,status,closes_at,scope,mobilization")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(40);
      const rows = !full.error && full.data?.length ? full.data : null;
      if (!rows) {
        const basic = await supabase
          .from("jobs")
          .select("id,title,description,location,start_date,required_certs,status")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(40);
        if (!basic.error && basic.data?.length) {
          return (basic.data as JobRow[])
            .map(rowToPublicJob)
            .filter((job) => isJobOpen(job, now))
            .sort(byCloseThenStart);
        }
      } else {
        return (rows as JobRow[]).map(rowToPublicJob).filter((job) => isJobOpen(job, now)).sort(byCloseThenStart);
      }
    } catch (error) {
      console.error("Failed to load jobs from database:", error);
    }
  }
  return listCatalogJobs(now);
}
