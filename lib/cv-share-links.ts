import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { createServiceSupabaseClient } from "@/lib/supabase/admin";

export const CV_SHARE_TOKEN_BYTES = 32;
export const CV_SHARE_DEFAULT_EXPIRY_DAYS = 90;

export type CvShareLinkRow = {
  id: string;
  diver_id: string;
  token_hash: string;
  recipient_email: string;
  job_id: string | null;
  company_id: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type CvShareLinkSummary = {
  id: string;
  recipientEmail: string;
  jobId: string | null;
  companyId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
};

export function hashCvShareToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateCvShareToken() {
  return randomBytes(CV_SHARE_TOKEN_BYTES).toString("base64url");
}

export function buildCvShareUrl(username: string, token: string) {
  const user = username.trim().toLowerCase();
  return `${SITE_URL}/cv/${encodeURIComponent(user)}?share=${encodeURIComponent(token)}`;
}

export function evaluateCvShareLinkRow(
  row: Pick<CvShareLinkRow, "diver_id" | "expires_at" | "revoked_at"> | null | undefined,
  diverUserId: string,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  if (row.diver_id !== diverUserId) return false;
  if (row.revoked_at) return false;
  const expires = new Date(row.expires_at);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) return false;
  return true;
}

export function formatApplicationContactBlock(email: string, phone?: string | null) {
  const lines = [`Email: ${email.trim()}`];
  const normalizedPhone = phone?.trim();
  if (normalizedPhone) lines.push(`Phone: ${normalizedPhone}`);
  return lines.join("\n");
}

function toSummary(row: CvShareLinkRow, now = new Date()): CvShareLinkSummary {
  return {
    id: row.id,
    recipientEmail: row.recipient_email,
    jobId: row.job_id,
    companyId: row.company_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    active: evaluateCvShareLinkRow(row, row.diver_id, now),
  };
}

export async function createCvShareLink(input: {
  diverId: string;
  recipientEmail: string;
  jobId?: string | null;
  companyId?: string | null;
  expiryDays?: number;
}): Promise<{ token: string; id: string } | { error: string }> {
  const token = generateCvShareToken();
  const tokenHash = hashCvShareToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (input.expiryDays ?? CV_SHARE_DEFAULT_EXPIRY_DAYS));

  const admin = createServiceSupabaseClient();
  const { data, error } = await admin
    .from("cv_share_links")
    .insert({
      diver_id: input.diverId,
      token_hash: tokenHash,
      recipient_email: input.recipientEmail.trim().toLowerCase(),
      job_id: input.jobId?.trim() || null,
      company_id: input.companyId ?? null,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("createCvShareLink failed:", error?.code);
    return { error: "Could not create CV share link." };
  }
  return { token, id: data.id };
}

export async function validateCvShareToken(token: string, diverUserId: string): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return false;
  const admin = createServiceSupabaseClient();
  const { data } = await admin
    .from("cv_share_links")
    .select("diver_id, expires_at, revoked_at")
    .eq("token_hash", hashCvShareToken(trimmed))
    .maybeSingle();
  return evaluateCvShareLinkRow(data as CvShareLinkRow | null, diverUserId);
}

export async function listCvShareLinksForDiver(
  supabase: SupabaseClient,
  diverId: string,
): Promise<CvShareLinkSummary[]> {
  const { data, error } = await supabase
    .from("cv_share_links")
    .select("id, diver_id, recipient_email, job_id, company_id, created_at, expires_at, revoked_at")
    .eq("diver_id", diverId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("listCvShareLinksForDiver failed:", error.code);
    return [];
  }
  return (data ?? []).map((row) => toSummary(row as CvShareLinkRow));
}

export async function revokeCvShareLink(
  supabase: SupabaseClient,
  diverId: string,
  linkId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("cv_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("diver_id", diverId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("revokeCvShareLink failed:", error.code);
    return { ok: false, error: "Could not revoke link." };
  }
  if (!data?.id) return { ok: false, error: "Link not found or already revoked." };
  return { ok: true };
}
