import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_CATALOG, type PublicJob } from "@/lib/job-catalog";

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
